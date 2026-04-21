import { getPredictionById, updateShopStockRecommendationsFromPrediction } from '../../_lib/db.js'
import { wrap, sendJson } from '../../_lib/http.js'

export default wrap(async function handler(req, res) {
  const prediction = await getPredictionById(req.query.id)
  if (!prediction) return sendJson(res, 404, { error: 'Prediction not found' })
  await updateShopStockRecommendationsFromPrediction(prediction)
  return sendJson(res, 200, { ok: true })
}, ['POST'])
