import fs from 'fs'
import { createImportRecord, getSourceRows, replaceSourceRows, upsertShopStockLines } from '../_lib/db.js'
import { formidableConfig, parseDemandAnalysisFile, parseMatsitFile, parseMultipartFile, parseSslFile, parseZrrrFile } from '../_lib/imports.js'
import { wrap, sendJson } from '../_lib/http.js'
import { buildSeedShopStock } from '../_lib/model.js'

export const config = formidableConfig

const SOURCE_MAP = {
  matsit: 'matsit',
  ssl: 'ssl',
  'demand-analysis': 'demand_analysis',
  zrrr: 'zrrr',
}

export default wrap(async function handler(req, res) {
  const type = req.query.type
  const parserMap = {
    matsit: parseMatsitFile,
    ssl: parseSslFile,
    'demand-analysis': parseDemandAnalysisFile,
    zrrr: parseZrrrFile,
  }
  const parser = parserMap[type]
  if (!parser) return sendJson(res, 400, { error: 'Unsupported import type' })

  const { file, uicId } = await parseMultipartFile(req)
  const rows = parser(file.filepath)
  fs.unlink(file.filepath, () => {})
  if (!rows.length) return sendJson(res, 400, { error: 'No valid rows found in file' })

  const importType = SOURCE_MAP[type]
  const importRecord = await createImportRecord({ uicId, importType, fileName: file.originalFilename || file.newFilename || 'upload.xlsx', rowCount: rows.length })
  await replaceSourceRows({ uicId, sourceType: importType, importId: importRecord.id, rows })

  if (['matsit', 'ssl', 'demand-analysis', 'zrrr'].includes(type)) {
    const [matsitRows, sslRows, demandRows, zrrrRows] = await Promise.all([
      getSourceRows(uicId, 'matsit'),
      getSourceRows(uicId, 'ssl'),
      getSourceRows(uicId, 'demand_analysis'),
      getSourceRows(uicId, 'zrrr'),
    ])
    if (matsitRows.length) {
      const shopStock = buildSeedShopStock(uicId, matsitRows, sslRows, demandRows, zrrrRows)
      await upsertShopStockLines(uicId, shopStock, importRecord.id)
    }
  }

  return sendJson(res, 200, importRecord)
}, ['POST'])
