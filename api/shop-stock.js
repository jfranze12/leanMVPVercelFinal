import { wrap, sendJson } from './_lib/http.js'
import { getShopStockCount, getShopStockLines, getUics } from './_lib/db.js'

export default wrap(async function handler(req, res) {
  const uics = await getUics()
  const uicId = req.query.uicId || uics[0]?.id
  const limit = req.query.limit ? Number(req.query.limit) : null
  const [rows, total] = await Promise.all([
    getShopStockLines(uicId, limit),
    getShopStockCount(uicId),
  ])
  return sendJson(res, 200, { rows, total })
})
