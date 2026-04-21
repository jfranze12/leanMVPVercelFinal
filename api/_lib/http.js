import { ensureSchema, initializeDatabase, isInitialized } from './db.js'

export function sendJson(res, status, payload) {
  res.status(status).json(payload)
}

export async function ensureReady() {
  await ensureSchema()
  if (!(await isInitialized())) {
    await initializeDatabase()
  }
}

export function methodNotAllowed(res, methods = ['GET']) {
  res.setHeader('Allow', methods)
  return sendJson(res, 405, { error: 'Method not allowed' })
}

export function wrap(handler, methods = ['GET']) {
  return async function wrapped(req, res) {
    if (!methods.includes(req.method)) return methodNotAllowed(res, methods)
    try {
      await ensureReady()
      await handler(req, res)
    } catch (error) {
      console.error(error)
      return sendJson(res, 500, { error: error.message || 'Internal server error' })
    }
  }
}
