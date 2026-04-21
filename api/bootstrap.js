import { wrap, sendJson } from './_lib/http.js'
import { getActualResults, getDatasetEntries, getLocations, getMetricSummary, getMetrics, getPredictions, getShopStockLines, getUics, latestImportTimeForType } from './_lib/db.js'

export default wrap(async function handler(req, res) {
  const uics = await getUics()
  const uicId = req.query.uicId || uics[0]?.id
  const [locations, dataset, shopStockLines, predictions, actualResults, metrics, shopStockUpdatedAt, metricSummary] = await Promise.all([
    getLocations(),
    getDatasetEntries(),
    getShopStockLines(uicId),
    getPredictions(uicId),
    getActualResults(uicId),
    getMetrics(uicId),
    latestImportTimeForType('matsit'),
    getMetricSummary(uicId),
  ])
  return sendJson(res, 200, {
    uics,
    locations,
    dataset,
    shopStockUpdatedAt,
    shopStockLines,
    predictions,
    actualResults,
    metrics,
    metricSummary,
  })
})
