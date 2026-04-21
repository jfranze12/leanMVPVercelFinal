import { getPredictionById, updatePredictionAdjustment } from '../../_lib/db.js'
import { wrap, sendJson } from '../../_lib/http.js'

export default wrap(async function handler(req, res) {
  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  const prediction = await getPredictionById(req.query.id)
  if (!prediction) return sendJson(res, 404, { error: 'Prediction not found' })
  const humanAdjustment = {
    adjustedByUser: true,
    adjustmentNotes: payload.adjustmentNotes || '',
    createdAt: new Date().toISOString(),
    lines: (payload.lines || []).map((line) => ({
      materialNumber: line.materialNumber,
      description: line.description,
      humanPredictedQty: Number(line.humanPredictedQty),
      humanReorderPoint: Number(line.humanReorderPoint),
    })),
  }
  await updatePredictionAdjustment(prediction.id, humanAdjustment)
  const updated = await getPredictionById(prediction.id)
  return sendJson(res, 200, updated)
}, ['POST'])
