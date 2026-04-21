import { createId } from './_lib/utils.js'
import { getPredictionById, replaceMetrics, upsertActualResult } from './_lib/db.js'
import { scorePrediction } from './_lib/model.js'
import { wrap, sendJson } from './_lib/http.js'

export default wrap(async function handler(req, res) {
  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  const prediction = await getPredictionById(payload.predictionId)
  if (!prediction) return sendJson(res, 404, { error: 'Prediction not found' })

  const actualResult = {
    id: createId('res'),
    predictionId: prediction.id,
    trainingEventId: prediction.trainingEventId,
    uicId: prediction.uicId,
    uploadedAt: new Date().toISOString(),
    sourceImportId: null,
    datasetLabel: `Training results: ${prediction.event.locationName} ${prediction.event.startDate}`,
    lines: (payload.lines || []).map((line) => ({
      materialNumber: line.materialNumber,
      description: line.description,
      actualQty: Number(line.actualQty || 0),
    })),
  }

  await upsertActualResult(actualResult)
  const scoreLines = scorePrediction(prediction, actualResult)
  await replaceMetrics(prediction.id, scoreLines)
  return sendJson(res, 200, { result: actualResult, metrics: scoreLines })
}, ['POST'])
