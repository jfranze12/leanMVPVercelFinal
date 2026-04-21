import { createId, differenceInDays, fiscalYearFromDate, getQuarterContexts, quarterFromDate } from './utils.js'

export function averageLeadTime(zrrrRows, materialNumber) {
  const filtered = zrrrRows.filter((row) => row.materialNumber === materialNumber && typeof row.leadTimeDays === 'number')
  if (!filtered.length) return 14
  return filtered.reduce((sum, row) => sum + row.leadTimeDays, 0) / filtered.length
}

export function buildSeedShopStock(uicId, matsitRows, sslRows, demandRows, zrrrRows) {
  const sslMap = new Map(sslRows.map((row) => [row.materialNumber, row]))
  const demandMap = new Map(demandRows.map((row) => [row.materialNumber, row]))
  const now = new Date().toISOString()

  const lines = matsitRows
    .filter((row) => row.reorderPoint > 0 || row.stock > 0 || row.availableStock > 0)
    .map((row) => {
      const ssl = sslMap.get(row.materialNumber)
      const demand = demandMap.get(row.materialNumber)
      const leadTime = averageLeadTime(zrrrRows, row.materialNumber)
      const calculatedReorderPoint = Math.max(
        row.reorderPoint,
        ssl?.reorderPoint || 0,
        demand?.adjCalRop || demand?.calRop || 0,
        Math.round((demand?.qtyOfConsumption || 0) / Math.max(1, demand?.months || 3) + leadTime / 10),
      )
      return {
        id: createId('ssl'),
        uicId,
        materialNumber: row.materialNumber,
        description: row.description,
        fsc: row.fsc,
        supplyCode: row.supplyCode,
        mrpType: row.mrpType,
        onHand: row.stock,
        availableStock: row.availableStock,
        safetyStock: row.safetyStock,
        reorderPoint: row.reorderPoint,
        calculatedReorderPoint,
        recommendedReorderPoint: calculatedReorderPoint,
        lastMovementDate: row.lastMovementDate,
        lastReceiptDate: row.lastReceiptDate,
        lastIssueDate: row.lastIssueDate,
        leadTimeDays: Math.round(leadTime),
        demandAddDelRet: demand?.addDelRet || '',
        quarterlyDemandEstimate: demand?.qtyOfConsumption || 0,
        sourceImportId: 'imp_matsit_seed',
        active: true,
        createdAt: now,
        updatedAt: now,
      }
    })
    .sort((a, b) => b.recommendedReorderPoint - a.recommendedReorderPoint || a.description.localeCompare(b.description))

  const unique = []
  const seen = new Set()
  for (const row of lines) {
    if (!row.materialNumber || seen.has(row.materialNumber)) continue
    seen.add(row.materialNumber)
    unique.push(row)
  }
  return unique.slice(0, 330)
}

export function buildPrediction({ db, payload }) {
  const { uicId, locationName, distanceMiles, vehicleCount, startDate, endDate, notes } = payload
  const durationDays = differenceInDays(startDate, endDate)
  const quarter = quarterFromDate(startDate)
  const fiscalYear = fiscalYearFromDate(startDate)
  const { previousQuarter, matchingQuarter } = getQuarterContexts(quarter)

  const event = {
    id: createId('evt'),
    uicId,
    locationName,
    distanceMiles: Number(distanceMiles),
    vehicleCount: Number(vehicleCount),
    startDate,
    endDate,
    durationDays,
    quarter,
    fiscalYear,
    notes: notes || '',
    createdAt: new Date().toISOString(),
  }

  const demandRows = db.demandAnalysis || []
  const zrrrRows = db.zrrr || []
  const historicalPredictions = db.predictions || []
  const actualResults = db.actualResults || []
  const shopStock = (db.shopStockLines || []).filter((line) => line.uicId === uicId)

  const lineByMaterial = new Map(shopStock.map((line) => [line.materialNumber, line]))
  const demandByMaterial = new Map(demandRows.map((row) => [row.materialNumber, row]))

  const matchingQuarterUsageMap = new Map()
  const priorQuarterUsageMap = new Map()

  historicalPredictions.forEach((prediction) => {
    const actual = actualResults.find((result) => result.predictionId === prediction.id)
    if (!actual) return
    const targetMap = prediction.quarter === matchingQuarter ? matchingQuarterUsageMap : prediction.quarter === previousQuarter ? priorQuarterUsageMap : null
    if (!targetMap) return
    actual.lines.forEach((line) => targetMap.set(line.materialNumber, (targetMap.get(line.materialNumber) || 0) + Number(line.actualQty || 0)))
  })

  const intensity = (Number(vehicleCount) * Math.max(1, durationDays) * (1 + Number(distanceMiles) / 500)) / 12
  const allMaterials = shopStock.slice(0, 120).map((line) => line.materialNumber)

  const algorithmLines = allMaterials.map((materialNumber) => {
    const line = lineByMaterial.get(materialNumber)
    const demand = demandByMaterial.get(materialNumber)
    const sameQuarterHistory = matchingQuarterUsageMap.get(materialNumber) || 0
    const previousQuarterHistory = priorQuarterUsageMap.get(materialNumber) || 0
    const baselineDemand = ((demand?.qtyOfConsumption || 0) / Math.max(1, demand?.months || 3)) * 3
    const leadTimeDays = averageLeadTime(zrrrRows, materialNumber)
    const priorMean = (0.45 * sameQuarterHistory) + (0.35 * previousQuarterHistory) + (0.2 * baselineDemand)
    const evidenceBoost = intensity * (line.supplyCode === '9O' ? 1.15 : line.supplyCode === '9K' ? 1.05 : 1)
    const posteriorMeanDemand = Math.max(0, (0.55 * priorMean) + (0.45 * evidenceBoost))
    const fillRateFactor = 1.15
    const safetyBuffer = Math.max(line.safetyStock || 0, Math.ceil(leadTimeDays / 14))
    const predictedQty = Math.max(0, Math.round(posteriorMeanDemand))
    const keepProbability = Math.max(0.05, Math.min(0.99, (posteriorMeanDemand + safetyBuffer + (demand?.addDelRet === 'A' ? 1.5 : 0)) / (posteriorMeanDemand + safetyBuffer + 5)))
    const predictedReorderPoint = Math.max(line.reorderPoint || 0, Math.ceil((posteriorMeanDemand * fillRateFactor) + safetyBuffer + (leadTimeDays / 10)))

    return {
      materialNumber,
      description: line.description,
      predictedQty,
      predictedKeepProbability: Number(keepProbability.toFixed(3)),
      predictedReorderPoint,
      rankScore: Number((posteriorMeanDemand + safetyBuffer + keepProbability * 5).toFixed(3)),
      posteriorMeanDemand: Number(posteriorMeanDemand.toFixed(3)),
      leadTimeDays: Math.round(leadTimeDays),
    }
  })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 25)

  const prediction = {
    id: createId('pred'),
    trainingEventId: event.id,
    uicId,
    modelVersion: 'bayesian-mvp-v1',
    quarter,
    quarterContext: quarter,
    previousQuarterContext: previousQuarter,
    matchingQuarterContext: matchingQuarter,
    status: 'created',
    createdAt: new Date().toISOString(),
    event,
    algorithmLines,
    humanAdjustment: null,
  }

  return { event, prediction }
}

export function scorePrediction(prediction, actualResult) {
  const actualMap = new Map((actualResult.lines || []).map((line) => [line.materialNumber, Number(line.actualQty || 0)]))
  const humanMap = new Map((prediction.humanAdjustment?.lines || []).map((line) => [line.materialNumber, Number(line.humanPredictedQty || 0)]))

  return prediction.algorithmLines.map((line) => {
    const actualQty = actualMap.get(line.materialNumber) || 0
    const algorithmPredictedQty = Number(line.predictedQty || 0)
    const humanPredictedQty = humanMap.has(line.materialNumber) ? humanMap.get(line.materialNumber) : algorithmPredictedQty
    return {
      id: createId('metric'),
      materialNumber: line.materialNumber,
      description: line.description,
      actualQty,
      algorithmPredictedQty,
      humanPredictedQty,
      algorithmAbsError: Math.abs(actualQty - algorithmPredictedQty),
      humanAbsError: Math.abs(actualQty - humanPredictedQty),
      algorithmSqError: Math.pow(actualQty - algorithmPredictedQty, 2),
      humanSqError: Math.pow(actualQty - humanPredictedQty, 2),
    }
  })
}
