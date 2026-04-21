import xlsx from 'xlsx'
import formidable from 'formidable'
import { normalizeMaterial, safeDate, VEHICLE_CODES } from './utils.js'

export const formidableConfig = {
  api: {
    bodyParser: false,
  },
}

export async function parseMultipartFile(req) {
  const form = formidable({ multiples: false, keepExtensions: true })
  const [fields, files] = await form.parse(req)
  const file = Array.isArray(files.file) ? files.file[0] : files.file
  const uicId = Array.isArray(fields.uicId) ? fields.uicId[0] : fields.uicId
  if (!file) throw new Error('File required')
  return { file, uicId }
}

function readWorkbookRows(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true })
  const sheetName = workbook.SheetNames[0]
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false })
}

export function parseMatsitFile(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => VEHICLE_CODES.has(String(row['Supply Category Material Code'] || '').trim()))
    .map((row) => ({
      materialNumber: normalizeMaterial(row.Material),
      description: row['Material Description'] || 'Unknown Material',
      supplyCode: String(row['Supply Category Material Code'] || '').trim(),
      fsc: row.FSC ? String(row.FSC) : null,
      stock: Number(row.Stock || 0),
      availableStock: Number(row['Available Stock'] || 0),
      safetyStock: Number(row['Safety Stock'] || 0),
      reorderPoint: Number(row['Reorder Point'] || 0),
      mrpType: row['MRP Type'] || '',
      lastMovementDate: safeDate(row['Last Movement Date']),
      lastReceiptDate: safeDate(row['Last Receipt Date']),
      lastIssueDate: safeDate(row['Last Issue Date']),
      storageLocation: row['Storage Location'] || '',
      mrpArea: row['MRP Area'] || '',
      unitOfMeasure: row['Unit of Measure'] || '',
    }))
}

export function parseSslFile(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => row.Material)
    .map((row) => ({
      materialNumber: normalizeMaterial(row.Material),
      description: row.Description || 'Unknown Material',
      onHand: Number(row['On-Hand'] || 0),
      reorderPoint: Number(row.ROP || 0),
      inboundDelivery: Number(row['Inb Del'] || 0),
      dueOut: Number(row['Due Out'] || 0),
      mrpType: row.MT || '',
      safetyStock: Number(row.SafStk || 0),
      supplyClassLabel: row['Unnamed: 20'] || null,
      mrpArea: row['MRP Area'] || '',
      storageLocation: row['S.Loc'] || '',
    }))
}

export function parseDemandAnalysisFile(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => VEHICLE_CODES.has(String(row.SC || '').trim()))
    .map((row) => ({
      materialNumber: normalizeMaterial(row.Material),
      description: row.Description || 'Unknown Material',
      addDelRet: row.AddDelRet || '',
      qtyOfConsumption: Number(row['Qty of Consumption'] || 0),
      months: Number(row['Mos.'] || 0),
      reorderPoint: Number(row['Reorder Point'] || 0),
      calRop: Number(row.CalROP || 0),
      adjCalRop: Number(row.AdjCalROP || row.CalROP || 0),
      wsd: row.WSD || '',
      sc: String(row.SC || '').trim(),
      aac: row.AAC || '',
      fsc: row.FSC ? String(row.FSC) : null,
      mrpArea: row['MRP Area'] || '',
      mtc: row.MTc || '',
      mts: row.MTs || '',
      approved: Boolean(row.Approve),
    }))
}

export function parseZrrrFile(filePath) {
  return readWorkbookRows(filePath)
    .filter((row) => VEHICLE_CODES.has(String(row['Supply Category Material Code'] || '').trim()))
    .map((row) => {
      const reqDate = row['Requirement Date'] ? new Date(row['Requirement Date']) : null
      const poDate = row['POCre.Date'] ? new Date(row['POCre.Date']) : null
      const leadTimeDays = reqDate && poDate && !Number.isNaN(reqDate.getTime()) && !Number.isNaN(poDate.getTime())
        ? Math.max(0, Math.round((poDate - reqDate) / 86400000))
        : null
      return {
        materialNumber: normalizeMaterial(row.Material),
        supplyCode: String(row['Supply Category Material Code'] || '').trim(),
        requirementDate: safeDate(row['Requirement Date']),
        prCreateDate: safeDate(row['PRCre.Date']),
        poCreateDate: safeDate(row['POCre.Date']),
        requirementQty: Number(row['Requirement Quantity'] || 0),
        orderQty: Number(row['Order Quantity'] || 0),
        urgency: Number(row['Requirement Urgency'] || 0),
        priority: Number(row['Requirement Priority'] || 0),
        storageLocation: row['Storage Location'] || '',
        mrpType: row['MRP Type'] || '',
        mrpArea: row['MRP Area'] || '',
        leadTimeDays,
      }
    })
}
