import { getMetricSummary, getUics } from '../_lib/db.js'
import { wrap, sendJson } from '../_lib/http.js'

export default wrap(async function handler(req, res) {
  const uics = await getUics()
  const uicId = req.query.uicId || uics[0]?.id
  const summary = await getMetricSummary(uicId)
  return sendJson(res, 200, summary)
})
