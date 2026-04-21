import fs from 'fs'
import path from 'path'
import xlsx from 'xlsx'

const DATA_DIR = path.resolve('server/data')
const DB_PATH = path.join(DATA_DIR, 'db.json')
const VEHICLE_CODES = new Set(['9D', '9K', '9O'])

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function safeDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function readWorkbookRows(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true })
  const sheetName = workbook.SheetNames[0]
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false })
}

function quarterFromDate(input) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return 'Q1 2026'
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `Q${q} ${d.getUTCFullYear()}`
}

function fiscalYearFromDate(input) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return 2026
  return d.getUTCFullYear()
}

function differenceInDays(start, end) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1
  const diff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, diff)
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeMaterial(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).replace(/\.0$/, '').trim()
}

function loadDb() {
  ensureDir()
  if (!fs.existsSync(DB_PATH)) {
    const seeded = seedInitialDb()
    saveDb(seeded)
    return seeded
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
}

function saveDb(db) {
  ensureDir()
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
}

function seedInitialDb() {
  const matsitRows = parseMatsit(path.resolve('seed-data/MATSIT Vehicles Only.XLSX'))
  const sslRows = parseSsl(path.resolve('seed-data/SSL Example Vehicles Only.xlsx'))
  const demandRows = parseDemandAnalysis(path.resolve('seed-data/Demand Analysis Vehicles.XLSX'))
  const zrrrRows = parseZrrr(path.resolve('seed-data/ZRRR 24 Oct Vehicles Only.xlsx'))

  const uicId = 'uic_a12'
  const locations = [
    { id: 'loc_home', name: 'Home Station', distanceMiles: 0, type: 'home' },
    { id: 'loc_local', name: 'Local Training Area', distanceMiles: 35, type: 'local' },
    { id: 'loc_yakima', name: 'Yakima Training Center', distanceMiles: 170, type: 'regional' },
    { id: 'loc_ntc', name: 'NTC', distanceMiles: 1200, type: 'rotation' },
    { id: 'loc_jmrc', name: 'JMRC', distanceMiles: 5200, type: 'rotation' },
    { id: 'loc_graf', name: 'Grafenwoehr', distanceMiles: 4300, type: 'regional' },
  ]

  const uics = [
    { id: uicId, code: 'UIC-A12', unit: '1-17 Infantry', accent: 'from-neutral-700 to-neutral-800', location: 'Fort Carson, Colorado', homeLocationName: 'Home Station' },
    { id: 'uic_b48', code: 'UIC-B48', unit: '2-2 Stryker Brigade', accent: 'from-stone-700 to-neutral-800', location: 'Rose Barracks, Germany', homeLocationName: 'Grafenwoehr' },
    { id: 'uic_c31', code: 'UIC-C31', unit: '3-4 Cavalry', accent: 'from-zinc-700 to-neutral-800', location: 'Fort Wainwright, Alaska', homeLocationName: 'Home Station' },
  ]

  const now = new Date().toISOString()

  const imports = [
    { id: 'imp_matsit_seed', uicId, importType: 'matsit', fileName: 'MATSIT Vehicles Only.XLSX', rowCount: matsitRows.length, uploadedAt: now, status: 'complete' },
    { id: 'imp_ssl_seed', uicId, importType: 'ssl', fileName: 'SSL Example Vehicles Only.xlsx', rowCount: sslRows.length, uploadedAt: now, status: 'complete' },
    { id: 'imp_da_seed', uicId, importType: 'demand_analysis', fileName: 'Demand Analysis Vehicles.XLSX', rowCount: demandRows.length, uploadedAt: now, status: 'complete' },
    { id: 'imp_zrrr_seed', uicId, importType: 'zrrr', fileName: 'ZRRR 24 Oct Vehicles Only.xlsx', rowCount: zrrrRows.length, uploadedAt: now, status: 'complete' },
  ]

  const shopStockLines = buildSeedShopStock(uicId, matsitRows, sslRows, demandRows, zrrrRows).map((row) => ({
    ...row,
    id: createId('ssl'),
    uicId,
    sourceImportId: row.sourceImportId ?? 'imp_matsit_seed',
    active: true,
    createdAt: now,
    updatedAt: now,
  }))

  return {
    uics,
    locations,
    imports,
    dataset: imports.map((item) => ({ id: item.id, addedAt: item.uploadedAt, kind: item.importType, label: item.fileName })),
    shopStockLines,
    trainingEvents: [],
    predictions: [],
    actualResults: [],
    metrics: [],
    sourceRows: {
      matsit: matsitRows,
      ssl: sslRows,
      demandAnalysis: demandRows,
      zrrr: zrrrRows,
    },
  }
}

function parseMatsit(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => VEHICLE_CODES.has(String(row['Supply Category Material Code'] || '').trim()))
    .map((row) => ({
      materialNumber: normalizeMaterial(row.Material),
      description: row['Material Description'] || 'Unknown Material',
      supplyCode: String(row['Supply Category Material Code'] || '').trim(),
      fsc: row.FSC ? String(row.FSC) : null,
      stock: Number(row.Stock || 0),
      availableStock: Number(row['Available Stock'] || 0),
      safetyStock: Number(row['Safety Stock'] || 0),
      reorderPoint: Number(row['Reorder Point'] || 0),
      mrpType: row['MRP Type'] || '',
      lastMovementDate: safeDate(row['Last Movement Date']),
      lastReceiptDate: safeDate(row['Last Receipt Date']),
      lastIssueDate: safeDate(row['Last Issue Date']),
      storageLocation: row['Storage Location'] || '',
      mrpArea: row['MRP Area'] || '',
      unitOfMeasure: row['Unit of Measure'] || '',
    }))
}

function parseSsl(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => row.Material)
    .map((row) => ({
      materialNumber: normalizeMaterial(row.Material),
      description: row.Description || 'Unknown Material',
      onHand: Number(row['On-Hand'] || 0),
      reorderPoint: Number(row.ROP || 0),
      inboundDelivery: Number(row['Inb Del'] || 0),
      dueOut: Number(row['Due Out'] || 0),
      mrpType: row.MT || '',
      safetyStock: Number(row.SafStk || 0),
      supplyClassLabel: row['Unnamed: 20'] || null,
      mrpArea: row['MRP Area'] || '',
      storageLocation: row['S.Loc'] || '',
    }))
}

function parseDemandAnalysis(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => VEHICLE_CODES.has(String(row.SC || '').trim()))
    .map((row) => ({
      materialNumber: normalizeMaterial(row.Material),
      description: row.Description || 'Unknown Material',
      addDelRet: row.AddDelRet || '',
      qtyOfConsumption: Number(row['Qty of Consumption'] || 0),
      months: Number(row['Mos.'] || 0),
      reorderPoint: Number(row['Reorder Point'] || 0),
      calRop: Number(row.CalROP || 0),
      adjCalRop: Number(row.AdjCalROP || row.CalROP || 0),
      wsd: row.WSD || '',
      sc: String(row.SC || '').trim(),
      aac: row.AAC || '',
      fsc: row.FSC ? String(row.FSC) : null,
      mrpArea: row['MRP Area'] || '',
      mtc: row.MTc || '',
      mts: row.MTs || '',
      approved: Boolean(row.Approve),
    }))
}

function parseZrrr(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => VEHICLE_CODES.has(String(row['Supply Category Material Code'] || '').trim()))
    .map((row) => {
      const reqDate = row['Requirement Date'] ? new Date(row['Requirement Date']) : null
      const poDate = row['POCre.Date'] ? new Date(row['POCre.Date']) : null
      const leadTimeDays = reqDate && poDate && !Number.isNaN(reqDate.getTime()) && !Number.isNaN(poDate.getTime())
        ? Math.max(0, Math.round((poDate - reqDate) / (1000 * 60 * 60 * 24)))
        : null
      return {
        materialNumber: normalizeMaterial(row.Material),
        supplyCode: String(row['Supply Category Material Code'] || '').trim(),
        requirementDate: safeDate(row['Requirement Date']),
        prCreateDate: safeDate(row['PRCre.Date']),
        poCreateDate: safeDate(row['POCre.Date']),
        requirementQty: Number(row['Requirement Quantity'] || 0),
        orderQty: Number(row['Order Quantity'] || 0),
        urgency: Number(row['Requirement Urgency'] || 0),
        priority: Number(row['Requirement Priority'] || 0),
        storageLocation: row['Storage Location'] || '',
        mrpType: row['MRP Type'] || '',
        mrpArea: row['MRP Area'] || '',
        leadTimeDays,
      }
    })
}

function averageLeadTime(zrrrRows, materialNumber) {
  const filtered = zrrrRows.filter((row) => row.materialNumber === materialNumber && typeof row.leadTimeDays === 'number')
  if (!filtered.length) return 14
  return filtered.reduce((sum, row) => sum + row.leadTimeDays, 0) / filtered.length
}

function buildSeedShopStock(uicId, matsitRows, sslRows, demandRows, zrrrRows) {
  const sslMap = new Map(sslRows.map((row) => [row.materialNumber, row]))
  const demandMap = new Map(demandRows.map((row) => [row.materialNumber, row]))

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

function getQuarterContexts(db, quarter) {
  const [q, yearStr] = quarter.split(' ')
  const year = Number(yearStr)
  const quarterNum = Number(q.replace('Q', ''))
  const previousQuarterNum = quarterNum === 1 ? 4 : quarterNum - 1
  const previousQuarterYear = quarterNum === 1 ? year - 1 : year
  const previousQuarter = `Q${previousQuarterNum} ${previousQuarterYear}`
  const matchingQuarter = `Q${quarterNum} ${year - 1}`
  return { previousQuarter, matchingQuarter }
}

function buildPrediction(db, { uicId, locationName, distanceMiles, vehicleCount, startDate, endDate, notes }) {
  const durationDays = differenceInDays(startDate, endDate)
  const quarter = quarterFromDate(startDate)
  const fiscalYear = fiscalYearFromDate(startDate)
  const { previousQuarter, matchingQuarter } = getQuarterContexts(db, quarter)

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

  const demandRows = db.sourceRows.demandAnalysis || []
  const zrrrRows = db.sourceRows.zrrr || []
  const historicalPredictions = db.predictions || []
  const shopStock = db.shopStockLines.filter((line) => line.uicId === uicId)

  const lineByMaterial = new Map(shopStock.map((line) => [line.materialNumber, line]))
  const demandByMaterial = new Map(demandRows.map((row) => [row.materialNumber, row]))

  const quarterUsageMap = new Map()
  const matchingQuarterUsageMap = new Map()
  const priorQuarterUsageMap = new Map()

  historicalPredictions.forEach((prediction) => {
    const actual = db.actualResults.find((result) => result.predictionId === prediction.id)
    if (!actual) return
    const targetMap = prediction.quarter === matchingQuarter ? matchingQuarterUsageMap : prediction.quarter === previousQuarter ? priorQuarterUsageMap : quarterUsageMap
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
    const recommendedReorderPoint = Math.max(line.reorderPoint || 0, Math.ceil((posteriorMeanDemand * fillRateFactor) + safetyBuffer + (leadTimeDays / 10)))

    return {
      materialNumber,
      description: line.description,
      predictedQty,
      predictedKeepProbability: Number(keepProbability.toFixed(3)),
      predictedReorderPoint: recommendedReorderPoint,
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

function updateShopStockRecommendations(db, predictionId, useHuman = true) {
  const prediction = db.predictions.find((item) => item.id === predictionId)
  if (!prediction) return null
  const lines = useHuman && prediction.humanAdjustment?.lines?.length ? prediction.humanAdjustment.lines : prediction.algorithmLines
  db.shopStockLines = db.shopStockLines.map((item) => {
    const match = lines.find((line) => line.materialNumber === item.materialNumber)
    if (!match) return item
    return {
      ...item,
      recommendedReorderPoint: Math.max(item.reorderPoint || 0, Number(match.predictedReorderPoint || match.humanReorderPoint || item.recommendedReorderPoint || 0)),
      updatedAt: new Date().toISOString(),
    }
  })
  saveDb(db)
  return prediction
}

function scorePrediction(db, predictionId) {
  const prediction = db.predictions.find((item) => item.id === predictionId)
  const actual = db.actualResults.find((item) => item.predictionId === predictionId)
  if (!prediction || !actual) return null

  const actualMap = new Map(actual.lines.map((line) => [line.materialNumber, Number(line.actualQty || 0)]))
  const humanMap = new Map((prediction.humanAdjustment?.lines || []).map((line) => [line.materialNumber, Number(line.humanPredictedQty || 0)]))
  const scoreLines = prediction.algorithmLines.map((line) => {
    const actualQty = actualMap.get(line.materialNumber) || 0
    const algorithmPredictedQty = Number(line.predictedQty || 0)
    const humanPredictedQty = humanMap.has(line.materialNumber) ? humanMap.get(line.materialNumber) : algorithmPredictedQty
    return {
      id: createId('metric'),
      predictionId,
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

  db.metrics = db.metrics.filter((item) => item.predictionId !== predictionId).concat(scoreLines)
  saveDb(db)
  return scoreLines
}

function createImport(db, { uicId, importType, fileName, rows }) {
  const importId = createId('imp')
  const uploadedAt = new Date().toISOString()
  const importRecord = { id: importId, uicId, importType, fileName, rowCount: rows.length, uploadedAt, status: 'complete' }
  db.imports.unshift(importRecord)
  db.dataset.unshift({ id: importId, addedAt: uploadedAt, kind: importType, label: fileName })

  if (importType === 'matsit') {
    const parsed = rows
    db.sourceRows.matsit = parsed
    const existingMap = new Map(db.shopStockLines.map((line) => [line.materialNumber, line]))
    parsed.forEach((row) => {
      const existing = existingMap.get(row.materialNumber)
      const next = {
        id: existing?.id || createId('ssl'),
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
        calculatedReorderPoint: existing?.calculatedReorderPoint || row.reorderPoint,
        recommendedReorderPoint: existing?.recommendedReorderPoint || row.reorderPoint,
        lastMovementDate: row.lastMovementDate,
        lastReceiptDate: row.lastReceiptDate,
        lastIssueDate: row.lastIssueDate,
        leadTimeDays: existing?.leadTimeDays || 14,
        demandAddDelRet: existing?.demandAddDelRet || '',
        quarterlyDemandEstimate: existing?.quarterlyDemandEstimate || 0,
        sourceImportId: importId,
        active: true,
        createdAt: existing?.createdAt || uploadedAt,
        updatedAt: uploadedAt,
      }
      existingMap.set(row.materialNumber, next)
    })
    db.shopStockLines = [...existingMap.values()].sort((a, b) => b.recommendedReorderPoint - a.recommendedReorderPoint || a.description.localeCompare(b.description))
  }

  if (importType === 'ssl') db.sourceRows.ssl = rows
  if (importType === 'demand_analysis') db.sourceRows.demandAnalysis = rows
  if (importType === 'zrrr') db.sourceRows.zrrr = rows

  saveDb(db)
  return importRecord
}

export {
  loadDb,
  saveDb,
  parseMatsit,
  parseSsl,
  parseDemandAnalysis,
  parseZrrr,
  buildPrediction,
  updateShopStockRecommendations,
  scorePrediction,
  createImport,
  quarterFromDate,
  fiscalYearFromDate,
  differenceInDays,
}
