import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import {
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
} from './dataStore.js'

const app = express()
const upload = multer({ dest: path.resolve('server/uploads') })
const PORT = 3001

app.use(cors())
app.use(express.json())

app.get('/api/bootstrap', (req, res) => {
  const db = loadDb()
  const uicId = req.query.uicId || db.uics[0].id
  const shopStockLines = db.shopStockLines.filter((line) => line.uicId === uicId)
  const predictions = db.predictions.filter((item) => item.uicId === uicId)
  const actualResults = db.actualResults.filter((item) => item.uicId === uicId)
  const metrics = db.metrics.filter((item) => {
    const prediction = db.predictions.find((pred) => pred.id === item.predictionId)
    return prediction?.uicId === uicId
  })
  res.json({
    uics: db.uics,
    locations: db.locations,
    dataset: db.dataset,
    shopStockUpdatedAt: db.imports.find((item) => item.importType === 'matsit')?.uploadedAt || db.imports[0]?.uploadedAt || new Date().toISOString(),
    shopStockLines,
    predictions,
    actualResults,
    metrics,
  })
})

app.get('/api/shop-stock', (req, res) => {
  const db = loadDb()
  const uicId = req.query.uicId || db.uics[0].id
  const limit = req.query.limit ? Number(req.query.limit) : null
  const rows = db.shopStockLines.filter((line) => line.uicId === uicId)
  res.json({ rows: limit ? rows.slice(0, limit) : rows, total: rows.length })
})

app.post('/api/predictions/run', (req, res) => {
  const db = loadDb()
  const { event, prediction } = buildPrediction(db, req.body)
  db.trainingEvents.unshift(event)
  db.predictions.unshift(prediction)
  db.dataset.unshift({ id: prediction.id, addedAt: prediction.createdAt, kind: 'prediction', label: `Prediction: ${event.locationName} ${event.startDate}` })
  saveDb(db)
  res.json(prediction)
})

app.post('/api/predictions/:id/adjust', (req, res) => {
  const db = loadDb()
  const prediction = db.predictions.find((item) => item.id === req.params.id)
  if (!prediction) return res.status(404).json({ error: 'Prediction not found' })
  prediction.humanAdjustment = {
    adjustedByUser: true,
    adjustmentNotes: req.body.adjustmentNotes || '',
    createdAt: new Date().toISOString(),
    lines: (req.body.lines || []).map((line) => ({
      materialNumber: line.materialNumber,
      description: line.description,
      humanPredictedQty: Number(line.humanPredictedQty),
      humanReorderPoint: Number(line.humanReorderPoint),
    })),
  }
  prediction.status = 'adjusted'
  saveDb(db)
  res.json(prediction)
})

app.post('/api/predictions/:id/update-reorder', (req, res) => {
  const db = loadDb()
  const updated = updateShopStockRecommendations(db, req.params.id, true)
  if (!updated) return res.status(404).json({ error: 'Prediction not found' })
  res.json({ ok: true })
})

app.post('/api/results', (req, res) => {
  const db = loadDb()
  const prediction = db.predictions.find((item) => item.id === req.body.predictionId)
  if (!prediction) return res.status(404).json({ error: 'Prediction not found' })
  const actualResult = {
    id: `res_${Date.now()}`,
    predictionId: prediction.id,
    trainingEventId: prediction.trainingEventId,
    uicId: prediction.uicId,
    uploadedAt: new Date().toISOString(),
    sourceImportId: null,
    lines: (req.body.lines || []).map((line) => ({
      materialNumber: line.materialNumber,
      description: line.description,
      actualQty: Number(line.actualQty),
    })),
  }
  db.actualResults = [actualResult, ...db.actualResults.filter((item) => item.predictionId !== prediction.id)]
  db.dataset.unshift({ id: actualResult.id, addedAt: actualResult.uploadedAt, kind: 'result', label: `Training results: ${prediction.event.locationName} ${prediction.event.startDate}` })
  saveDb(db)
  const scoreLines = scorePrediction(db, prediction.id)
  res.json({ result: actualResult, metrics: scoreLines })
})

app.get('/api/metrics/summary', (req, res) => {
  const db = loadDb()
  const uicId = req.query.uicId || db.uics[0].id
  const predictions = db.predictions.filter((item) => item.uicId === uicId)
  const metrics = db.metrics.filter((item) => predictions.some((prediction) => prediction.id === item.predictionId))
  const eventsWithMetrics = predictions.filter((prediction) => metrics.some((metric) => metric.predictionId === prediction.id))
  const summary = {
    evaluatedEvents: eventsWithMetrics.length,
    algorithmMae: metrics.length ? metrics.reduce((sum, row) => sum + row.algorithmAbsError, 0) / metrics.length : null,
    humanMae: metrics.length ? metrics.reduce((sum, row) => sum + row.humanAbsError, 0) / metrics.length : null,
    algorithmRmse: metrics.length ? Math.sqrt(metrics.reduce((sum, row) => sum + row.algorithmSqError, 0) / metrics.length) : null,
    humanRmse: metrics.length ? Math.sqrt(metrics.reduce((sum, row) => sum + row.humanSqError, 0) / metrics.length) : null,
  }
  res.json(summary)
})

app.post('/api/imports/:type', upload.single('file'), (req, res) => {
  const db = loadDb()
  const type = req.params.type
  if (!req.file) return res.status(400).json({ error: 'File required' })

  let rows = []
  if (type === 'matsit') rows = parseMatsit(req.file.path)
  if (type === 'ssl') rows = parseSsl(req.file.path)
  if (type === 'demand-analysis') rows = parseDemandAnalysis(req.file.path)
  if (type === 'zrrr') rows = parseZrrr(req.file.path)
  if (!rows.length) return res.status(400).json({ error: 'No valid rows found in file' })

  const importType = type.replace('-', '_')
  const importRecord = createImport(db, { uicId: req.body.uicId || db.uics[0].id, importType, fileName: req.file.originalname, rows })
  fs.unlink(req.file.path, () => {})
  res.json(importRecord)
})

app.listen(PORT, () => {
  loadDb()
  console.log(`API listening on http://localhost:${PORT}`)
})
