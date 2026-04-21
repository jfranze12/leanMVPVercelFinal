import { wrap, sendJson } from '../_lib/http.js'
import { getActualResults, getPredictions, getShopStockLines, getSourceRows, insertPrediction, insertTrainingEvent } from '../_lib/db.js'
import { buildPrediction } from '../_lib/model.js'

export default wrap(async function handler(req, res) {
  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  const [shopStockLines, demandAnalysis, zrrr, predictions, actualResults] = await Promise.all([
    getShopStockLines(payload.uicId),
    getSourceRows(payload.uicId, 'demand_analysis'),
    getSourceRows(payload.uicId, 'zrrr'),
    getPredictions(payload.uicId),
    getActualResults(payload.uicId),
  ])

  const { event, prediction } = buildPrediction({
    db: { shopStockLines, demandAnalysis, zrrr, predictions, actualResults },
    payload,
  })

  await insertTrainingEvent(event)
  await insertPrediction(prediction)
  return sendJson(res, 200, prediction)
}, ['POST'])
