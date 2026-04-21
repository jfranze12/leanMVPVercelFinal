import { initializeDatabase } from '../_lib/db.js'
import { sendJson } from '../_lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST'])
    return sendJson(res, 405, { error: 'Method not allowed' })
  }
  const key = req.query.key || req.headers['x-init-key']
  if (!process.env.INIT_SECRET || key !== process.env.INIT_SECRET) {
    return sendJson(res, 401, { error: 'Unauthorized' })
  }
  try {
    const result = await initializeDatabase()
    return sendJson(res, 200, { ok: true, ...result })
  } catch (error) {
    console.error(error)
    return sendJson(res, 500, { error: error.message || 'Initialization failed' })
  }
}
