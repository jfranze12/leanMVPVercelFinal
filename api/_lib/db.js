import pg from "pg"
const { Pool } = pg

import { seedRows, seedUics, seedLocations } from './seed.js'
import { createId, json } from './utils.js'
import { buildSeedShopStock } from './model.js'

let _pool = null

function getPool() {
  if (!_pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    })
  }
  return _pool
}

function normalizeValue(value) {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value)
  return value
}

async function q(strings, ...values) {
  const text = strings.reduce((acc, part, index) => acc + part + (index < values.length ? `$${index + 1}` : ''), '')
  const params = values.map(normalizeValue)
  const result = await getPool().query(text, params)
  return { rows: result.rows }
}

export async function ensureSchema() {
  await q`CREATE TABLE IF NOT EXISTS app_meta (key text PRIMARY KEY, value jsonb);`
  await q`CREATE TABLE IF NOT EXISTS uics (
    id text PRIMARY KEY,
    code text NOT NULL,
    unit text NOT NULL,
    accent text,
    location text,
    home_location_name text
  );`
  await q`CREATE TABLE IF NOT EXISTS locations (
    id text PRIMARY KEY,
    name text NOT NULL,
    distance_miles integer NOT NULL,
    type text NOT NULL
  );`
  await q`CREATE TABLE IF NOT EXISTS imports (
    id text PRIMARY KEY,
    uic_id text NOT NULL,
    import_type text NOT NULL,
    file_name text NOT NULL,
    row_count integer NOT NULL,
    uploaded_at timestamptz NOT NULL,
    status text NOT NULL
  );`
  await q`CREATE TABLE IF NOT EXISTS dataset_entries (
    id text PRIMARY KEY,
    added_at timestamptz NOT NULL,
    kind text NOT NULL,
    label text NOT NULL
  );`
  await q`CREATE TABLE IF NOT EXISTS shop_stock_lines (
    id text PRIMARY KEY,
    uic_id text NOT NULL,
    material_number text NOT NULL,
    description text NOT NULL,
    fsc text,
    supply_code text,
    mrp_type text,
    on_hand integer DEFAULT 0,
    available_stock integer DEFAULT 0,
    safety_stock integer DEFAULT 0,
    reorder_point integer DEFAULT 0,
    calculated_reorder_point integer DEFAULT 0,
    recommended_reorder_point integer DEFAULT 0,
    last_movement_date timestamptz,
    last_receipt_date timestamptz,
    last_issue_date timestamptz,
    lead_time_days integer DEFAULT 14,
    demand_add_del_ret text,
    quarterly_demand_estimate integer DEFAULT 0,
    source_import_id text,
    active boolean DEFAULT true,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  );`
  await q`CREATE UNIQUE INDEX IF NOT EXISTS shop_stock_unique_uic_material ON shop_stock_lines (uic_id, material_number);`
  await q`CREATE TABLE IF NOT EXISTS source_rows (
    id text PRIMARY KEY,
    uic_id text NOT NULL,
    source_type text NOT NULL,
    material_number text,
    payload jsonb NOT NULL,
    import_id text,
    created_at timestamptz NOT NULL
  );`
  await q`CREATE INDEX IF NOT EXISTS source_rows_uic_source_idx ON source_rows (uic_id, source_type);`
  await q`CREATE TABLE IF NOT EXISTS training_events (
    id text PRIMARY KEY,
    uic_id text NOT NULL,
    location_name text NOT NULL,
    distance_miles integer NOT NULL,
    vehicle_count integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    duration_days integer NOT NULL,
    quarter text NOT NULL,
    fiscal_year integer NOT NULL,
    notes text,
    created_at timestamptz NOT NULL
  );`
  await q`CREATE TABLE IF NOT EXISTS predictions (
    id text PRIMARY KEY,
    training_event_id text NOT NULL,
    uic_id text NOT NULL,
    model_version text NOT NULL,
    quarter text NOT NULL,
    quarter_context text NOT NULL,
    previous_quarter_context text NOT NULL,
    matching_quarter_context text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    event_json jsonb NOT NULL,
    algorithm_lines jsonb NOT NULL,
    human_adjustment jsonb
  );`
  await q`CREATE TABLE IF NOT EXISTS actual_results (
    id text PRIMARY KEY,
    prediction_id text UNIQUE NOT NULL,
    training_event_id text NOT NULL,
    uic_id text NOT NULL,
    uploaded_at timestamptz NOT NULL,
    source_import_id text,
    lines jsonb NOT NULL
  );`
  await q`CREATE TABLE IF NOT EXISTS metrics (
    id text PRIMARY KEY,
    prediction_id text NOT NULL,
    material_number text NOT NULL,
    description text NOT NULL,
    actual_qty integer NOT NULL,
    algorithm_predicted_qty integer NOT NULL,
    human_predicted_qty integer NOT NULL,
    algorithm_abs_error double precision NOT NULL,
    human_abs_error double precision NOT NULL,
    algorithm_sq_error double precision NOT NULL,
    human_sq_error double precision NOT NULL
  );`
  await q`CREATE INDEX IF NOT EXISTS metrics_prediction_idx ON metrics (prediction_id);`
}

export async function isInitialized() {
  const result = await q`SELECT value FROM app_meta WHERE key = 'initialized' LIMIT 1;`
  return result.rows.length > 0
}

export async function initializeDatabase() {
  await ensureSchema()
  if (await isInitialized()) {
    return { alreadyInitialized: true }
  }

  const now = new Date().toISOString()
  for (const uic of seedUics) {
    await q`INSERT INTO uics (id, code, unit, accent, location, home_location_name)
      VALUES (${uic.id}, ${uic.code}, ${uic.unit}, ${uic.accent}, ${uic.location}, ${uic.homeLocationName})
      ON CONFLICT (id) DO NOTHING`
  }
  for (const location of seedLocations) {
    await q`INSERT INTO locations (id, name, distance_miles, type)
      VALUES (${location.id}, ${location.name}, ${location.distanceMiles}, ${location.type})
      ON CONFLICT (id) DO NOTHING`
  }

  const uicId = 'uic_a12'
  const imports = [
    { id: 'imp_matsit_seed', uicId, importType: 'matsit', fileName: 'MATSIT Vehicles Only.XLSX', rows: seedRows.matsit },
    { id: 'imp_ssl_seed', uicId, importType: 'ssl', fileName: 'SSL Example Vehicles Only.xlsx', rows: seedRows.ssl },
    { id: 'imp_da_seed', uicId, importType: 'demand_analysis', fileName: 'Demand Analysis Vehicles.XLSX', rows: seedRows.demandAnalysis },
    { id: 'imp_zrrr_seed', uicId, importType: 'zrrr', fileName: 'ZRRR 24 Oct Vehicles Only.xlsx', rows: seedRows.zrrr },
  ]

  for (const entry of imports) {
    await q`INSERT INTO imports (id, uic_id, import_type, file_name, row_count, uploaded_at, status)
      VALUES (${entry.id}, ${entry.uicId}, ${entry.importType}, ${entry.fileName}, ${entry.rows.length}, ${now}, 'complete')
      ON CONFLICT (id) DO NOTHING`
    await q`INSERT INTO dataset_entries (id, added_at, kind, label)
      VALUES (${entry.id}, ${now}, ${entry.importType}, ${entry.fileName})
      ON CONFLICT (id) DO NOTHING`
    for (const row of entry.rows) {
      await q`INSERT INTO source_rows (id, uic_id, source_type, material_number, payload, import_id, created_at)
        VALUES (${createId('src')}, ${entry.uicId}, ${entry.importType}, ${row.materialNumber || null}, ${json(row)}, ${entry.id}, ${now})`
    }
  }

  const shopStock = buildSeedShopStock(uicId, seedRows.matsit, seedRows.ssl, seedRows.demandAnalysis, seedRows.zrrr)
  for (const row of shopStock) {
    await q`INSERT INTO shop_stock_lines (
      id, uic_id, material_number, description, fsc, supply_code, mrp_type,
      on_hand, available_stock, safety_stock, reorder_point, calculated_reorder_point,
      recommended_reorder_point, last_movement_date, last_receipt_date, last_issue_date,
      lead_time_days, demand_add_del_ret, quarterly_demand_estimate, source_import_id, active, created_at, updated_at
    ) VALUES (
      ${row.id}, ${uicId}, ${row.materialNumber}, ${row.description}, ${row.fsc}, ${row.supplyCode}, ${row.mrpType},
      ${row.onHand}, ${row.availableStock}, ${row.safetyStock}, ${row.reorderPoint}, ${row.calculatedReorderPoint},
      ${row.recommendedReorderPoint}, ${row.lastMovementDate}, ${row.lastReceiptDate}, ${row.lastIssueDate},
      ${row.leadTimeDays}, ${row.demandAddDelRet}, ${row.quarterlyDemandEstimate}, ${row.sourceImportId}, ${row.active}, ${now}, ${now}
    )
    ON CONFLICT (uic_id, material_number) DO UPDATE SET
      description = EXCLUDED.description,
      fsc = EXCLUDED.fsc,
      supply_code = EXCLUDED.supply_code,
      mrp_type = EXCLUDED.mrp_type,
      on_hand = EXCLUDED.on_hand,
      available_stock = EXCLUDED.available_stock,
      safety_stock = EXCLUDED.safety_stock,
      reorder_point = EXCLUDED.reorder_point,
      calculated_reorder_point = EXCLUDED.calculated_reorder_point,
      recommended_reorder_point = EXCLUDED.recommended_reorder_point,
      last_movement_date = EXCLUDED.last_movement_date,
      last_receipt_date = EXCLUDED.last_receipt_date,
      last_issue_date = EXCLUDED.last_issue_date,
      lead_time_days = EXCLUDED.lead_time_days,
      demand_add_del_ret = EXCLUDED.demand_add_del_ret,
      quarterly_demand_estimate = EXCLUDED.quarterly_demand_estimate,
      source_import_id = EXCLUDED.source_import_id,
      active = EXCLUDED.active,
      updated_at = EXCLUDED.updated_at`
  }

  await q`INSERT INTO app_meta (key, value) VALUES ('initialized', ${json({ seeded: true })})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  return { alreadyInitialized: false, shopStockLines: shopStock.length }
}

export async function getUics() {
  const result = await q`SELECT id, code, unit, accent, location, home_location_name FROM uics ORDER BY code ASC`
  return result.rows.map((row) => ({
    id: row.id,
    code: row.code,
    unit: row.unit,
    accent: row.accent,
    location: row.location,
    homeLocationName: row.home_location_name,
  }))
}

export async function getLocations() {
  const result = await q`SELECT id, name, distance_miles, type FROM locations ORDER BY distance_miles ASC, name ASC`
  return result.rows.map((row) => ({ id: row.id, name: row.name, distanceMiles: row.distance_miles, type: row.type }))
}

export async function getDatasetEntries() {
  const result = await q`SELECT id, added_at, kind, label FROM dataset_entries ORDER BY added_at DESC`
  return result.rows.map((row) => ({ id: row.id, addedAt: row.added_at, kind: row.kind, label: row.label }))
}

export async function getShopStockLines(uicId, limit = null) {
  const result = limit
    ? await q`SELECT * FROM shop_stock_lines WHERE uic_id = ${uicId} AND active = true ORDER BY recommended_reorder_point DESC, description ASC LIMIT ${limit}`
    : await q`SELECT * FROM shop_stock_lines WHERE uic_id = ${uicId} AND active = true ORDER BY recommended_reorder_point DESC, description ASC`
  return result.rows.map(mapShopStockLine)
}

export async function getShopStockCount(uicId) {
  const result = await q`SELECT COUNT(*)::int AS count FROM shop_stock_lines WHERE uic_id = ${uicId} AND active = true`
  return result.rows[0]?.count || 0
}

function mapShopStockLine(row) {
  return {
    id: row.id,
    uicId: row.uic_id,
    materialNumber: row.material_number,
    description: row.description,
    fsc: row.fsc,
    supplyCode: row.supply_code,
    mrpType: row.mrp_type,
    onHand: row.on_hand,
    availableStock: row.available_stock,
    safetyStock: row.safety_stock,
    reorderPoint: row.reorder_point,
    calculatedReorderPoint: row.calculated_reorder_point,
    recommendedReorderPoint: row.recommended_reorder_point,
    lastMovementDate: row.last_movement_date,
    lastReceiptDate: row.last_receipt_date,
    lastIssueDate: row.last_issue_date,
    leadTimeDays: row.lead_time_days,
    demandAddDelRet: row.demand_add_del_ret,
    quarterlyDemandEstimate: row.quarterly_demand_estimate,
    sourceImportId: row.source_import_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getSourceRows(uicId, sourceType) {
  const result = await q`SELECT payload FROM source_rows WHERE uic_id = ${uicId} AND source_type = ${sourceType} ORDER BY created_at ASC`
  return result.rows.map((row) => row.payload)
}

export async function replaceSourceRows({ uicId, sourceType, importId, rows }) {
  await q`DELETE FROM source_rows WHERE uic_id = ${uicId} AND source_type = ${sourceType}`
  const createdAt = new Date().toISOString()
  for (const row of rows) {
    await q`INSERT INTO source_rows (id, uic_id, source_type, material_number, payload, import_id, created_at)
      VALUES (${createId('src')}, ${uicId}, ${sourceType}, ${row.materialNumber || null}, ${json(row)}, ${importId}, ${createdAt})`
  }
}

export async function createImportRecord({ uicId, importType, fileName, rowCount }) {
  const importId = createId('imp')
  const uploadedAt = new Date().toISOString()
  await q`INSERT INTO imports (id, uic_id, import_type, file_name, row_count, uploaded_at, status)
    VALUES (${importId}, ${uicId}, ${importType}, ${fileName}, ${rowCount}, ${uploadedAt}, 'complete')`
  await q`INSERT INTO dataset_entries (id, added_at, kind, label)
    VALUES (${importId}, ${uploadedAt}, ${importType}, ${fileName})`
  return { id: importId, uicId, importType, fileName, rowCount, uploadedAt, status: 'complete' }
}

export async function upsertShopStockLines(uicId, rows, importId) {
  const now = new Date().toISOString()
  for (const row of rows) {
    await q`INSERT INTO shop_stock_lines (
      id, uic_id, material_number, description, fsc, supply_code, mrp_type,
      on_hand, available_stock, safety_stock, reorder_point, calculated_reorder_point,
      recommended_reorder_point, last_movement_date, last_receipt_date, last_issue_date,
      lead_time_days, demand_add_del_ret, quarterly_demand_estimate, source_import_id, active, created_at, updated_at
    ) VALUES (
      ${row.id || createId('ssl')}, ${uicId}, ${row.materialNumber}, ${row.description}, ${row.fsc}, ${row.supplyCode}, ${row.mrpType},
      ${row.onHand}, ${row.availableStock}, ${row.safetyStock}, ${row.reorderPoint}, ${row.calculatedReorderPoint},
      ${row.recommendedReorderPoint}, ${row.lastMovementDate}, ${row.lastReceiptDate}, ${row.lastIssueDate},
      ${row.leadTimeDays || 14}, ${row.demandAddDelRet || ''}, ${row.quarterlyDemandEstimate || 0}, ${importId}, true, ${row.createdAt || now}, ${now}
    ) ON CONFLICT (uic_id, material_number) DO UPDATE SET
      description = EXCLUDED.description,
      fsc = EXCLUDED.fsc,
      supply_code = EXCLUDED.supply_code,
      mrp_type = EXCLUDED.mrp_type,
      on_hand = EXCLUDED.on_hand,
      available_stock = EXCLUDED.available_stock,
      safety_stock = EXCLUDED.safety_stock,
      reorder_point = EXCLUDED.reorder_point,
      calculated_reorder_point = EXCLUDED.calculated_reorder_point,
      recommended_reorder_point = EXCLUDED.recommended_reorder_point,
      last_movement_date = EXCLUDED.last_movement_date,
      last_receipt_date = EXCLUDED.last_receipt_date,
      last_issue_date = EXCLUDED.last_issue_date,
      lead_time_days = EXCLUDED.lead_time_days,
      demand_add_del_ret = EXCLUDED.demand_add_del_ret,
      quarterly_demand_estimate = EXCLUDED.quarterly_demand_estimate,
      source_import_id = EXCLUDED.source_import_id,
      active = EXCLUDED.active,
      updated_at = EXCLUDED.updated_at`
  }
}

export async function getPredictions(uicId) {
  const result = await q`SELECT * FROM predictions WHERE uic_id = ${uicId} ORDER BY created_at DESC`
  return result.rows.map(mapPrediction)
}

export async function getPredictionById(predictionId) {
  const result = await q`SELECT * FROM predictions WHERE id = ${predictionId} LIMIT 1`
  return result.rows[0] ? mapPrediction(result.rows[0]) : null
}

function mapPrediction(row) {
  return {
    id: row.id,
    trainingEventId: row.training_event_id,
    uicId: row.uic_id,
    modelVersion: row.model_version,
    quarter: row.quarter,
    quarterContext: row.quarter_context,
    previousQuarterContext: row.previous_quarter_context,
    matchingQuarterContext: row.matching_quarter_context,
    status: row.status,
    createdAt: row.created_at,
    event: row.event_json,
    algorithmLines: row.algorithm_lines || [],
    humanAdjustment: row.human_adjustment,
  }
}

export async function insertTrainingEvent(event) {
  await q`INSERT INTO training_events (id, uic_id, location_name, distance_miles, vehicle_count, start_date, end_date, duration_days, quarter, fiscal_year, notes, created_at)
    VALUES (${event.id}, ${event.uicId}, ${event.locationName}, ${event.distanceMiles}, ${event.vehicleCount}, ${event.startDate}, ${event.endDate}, ${event.durationDays}, ${event.quarter}, ${event.fiscalYear}, ${event.notes}, ${event.createdAt})`
}

export async function insertPrediction(prediction) {
  await q`INSERT INTO predictions (
    id, training_event_id, uic_id, model_version, quarter, quarter_context, previous_quarter_context, matching_quarter_context,
    status, created_at, event_json, algorithm_lines, human_adjustment
  ) VALUES (
    ${prediction.id}, ${prediction.trainingEventId}, ${prediction.uicId}, ${prediction.modelVersion}, ${prediction.quarter}, ${prediction.quarterContext}, ${prediction.previousQuarterContext}, ${prediction.matchingQuarterContext},
    ${prediction.status}, ${prediction.createdAt}, ${json(prediction.event)}, ${json(prediction.algorithmLines)}, ${json(prediction.humanAdjustment)}
  )`
  await q`INSERT INTO dataset_entries (id, added_at, kind, label)
    VALUES (${prediction.id}, ${prediction.createdAt}, 'prediction', ${`Prediction: ${prediction.event.locationName} ${prediction.event.startDate}`})`
}

export async function updatePredictionAdjustment(predictionId, humanAdjustment) {
  await q`UPDATE predictions SET human_adjustment = ${json(humanAdjustment)}, status = 'adjusted' WHERE id = ${predictionId}`
}

export async function updateShopStockRecommendationsFromPrediction(prediction) {
  const rows = prediction.humanAdjustment?.lines?.length
    ? prediction.humanAdjustment.lines.map((line) => ({ materialNumber: line.materialNumber, reorderPoint: line.humanReorderPoint }))
    : prediction.algorithmLines.map((line) => ({ materialNumber: line.materialNumber, reorderPoint: line.predictedReorderPoint }))

  for (const row of rows) {
    await q`UPDATE shop_stock_lines
      SET recommended_reorder_point = GREATEST(reorder_point, ${Number(row.reorderPoint || 0)}), updated_at = NOW()
      WHERE uic_id = ${prediction.uicId} AND material_number = ${row.materialNumber}`
  }
}

export async function getActualResults(uicId) {
  const result = await q`SELECT * FROM actual_results WHERE uic_id = ${uicId} ORDER BY uploaded_at DESC`
  return result.rows.map((row) => ({
    id: row.id,
    predictionId: row.prediction_id,
    trainingEventId: row.training_event_id,
    uicId: row.uic_id,
    uploadedAt: row.uploaded_at,
    sourceImportId: row.source_import_id,
    lines: row.lines || [],
  }))
}

export async function upsertActualResult(actualResult) {
  await q`INSERT INTO actual_results (id, prediction_id, training_event_id, uic_id, uploaded_at, source_import_id, lines)
    VALUES (${actualResult.id}, ${actualResult.predictionId}, ${actualResult.trainingEventId}, ${actualResult.uicId}, ${actualResult.uploadedAt}, ${actualResult.sourceImportId}, ${json(actualResult.lines)})
    ON CONFLICT (prediction_id) DO UPDATE SET
      uploaded_at = EXCLUDED.uploaded_at,
      source_import_id = EXCLUDED.source_import_id,
      lines = EXCLUDED.lines`
  await q`INSERT INTO dataset_entries (id, added_at, kind, label)
    VALUES (${actualResult.id}, ${actualResult.uploadedAt}, 'result', ${actualResult.datasetLabel})
    ON CONFLICT (id) DO UPDATE SET added_at = EXCLUDED.added_at, kind = EXCLUDED.kind, label = EXCLUDED.label`
}

export async function replaceMetrics(predictionId, scoreLines) {
  await q`DELETE FROM metrics WHERE prediction_id = ${predictionId}`
  for (const row of scoreLines) {
    await q`INSERT INTO metrics (
      id, prediction_id, material_number, description, actual_qty, algorithm_predicted_qty, human_predicted_qty,
      algorithm_abs_error, human_abs_error, algorithm_sq_error, human_sq_error
    ) VALUES (
      ${row.id}, ${predictionId}, ${row.materialNumber}, ${row.description}, ${row.actualQty}, ${row.algorithmPredictedQty}, ${row.humanPredictedQty},
      ${row.algorithmAbsError}, ${row.humanAbsError}, ${row.algorithmSqError}, ${row.humanSqError}
    )`
  }
}

export async function getMetrics(uicId) {
  const result = await q`
    SELECT
      m.id,
      m.prediction_id,
      m.material_number,
      m.description,
      m.actual_qty,
      m.algorithm_predicted_qty,
      m.human_predicted_qty,
      m.algorithm_abs_error,
      m.human_abs_error,
      m.algorithm_sq_error,
      m.human_sq_error
    FROM metrics m
    JOIN predictions p ON p.id = m.prediction_id
    WHERE p.uic_id = ${uicId}
    ORDER BY p.created_at DESC, m.description ASC
  `
  return result.rows.map((row) => ({
    id: row.id,
    predictionId: row.prediction_id,
    materialNumber: row.material_number,
    description: row.description,
    actualQty: row.actual_qty,
    algorithmPredictedQty: row.algorithm_predicted_qty,
    humanPredictedQty: row.human_predicted_qty,
    algorithmAbsError: Number(row.algorithm_abs_error),
    humanAbsError: Number(row.human_abs_error),
    algorithmSqError: Number(row.algorithm_sq_error),
    humanSqError: Number(row.human_sq_error),
  }))
}

export async function getMetricSummary(uicId) {
  const result = await q`
    SELECT
      COUNT(DISTINCT m.prediction_id)::int AS evaluated_events,
      AVG(m.algorithm_abs_error)::float8 AS algorithm_mae,
      AVG(m.human_abs_error)::float8 AS human_mae,
      SQRT(AVG(m.algorithm_sq_error))::float8 AS algorithm_rmse,
      SQRT(AVG(m.human_sq_error))::float8 AS human_rmse
    FROM metrics m
    JOIN predictions p ON p.id = m.prediction_id
    WHERE p.uic_id = ${uicId}
  `
  const row = result.rows[0] || {}
  return {
    evaluatedEvents: row.evaluated_events || 0,
    algorithmMae: row.algorithm_mae ?? null,
    humanMae: row.human_mae ?? null,
    algorithmRmse: row.algorithm_rmse ?? null,
    humanRmse: row.human_rmse ?? null,
  }
}

export async function latestImportTimeForType(importType) {
  const result = await q`SELECT uploaded_at FROM imports WHERE import_type = ${importType} ORDER BY uploaded_at DESC LIMIT 1`
  return result.rows[0]?.uploaded_at || null
}
