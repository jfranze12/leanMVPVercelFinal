export const VEHICLE_CODES = new Set(['9D', '9K', '9O'])

export function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function safeDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function quarterFromDate(input) {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return 'Q1 2026'
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
}

export function fiscalYearFromDate(input) {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return 2026
  return date.getUTCFullYear()
}

export function differenceInDays(start, end) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1
  return Math.max(1, Math.ceil((endDate - startDate) / 86400000) + 1)
}

export function normalizeMaterial(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).replace(/\.0$/, '').trim()
}

export function getQuarterContexts(quarter) {
  const [q, yearStr] = quarter.split(' ')
  const year = Number(yearStr)
  const quarterNum = Number(q.replace('Q', ''))
  const previousQuarterNum = quarterNum === 1 ? 4 : quarterNum - 1
  const previousQuarterYear = quarterNum === 1 ? year - 1 : year
  return {
    previousQuarter: `Q${previousQuarterNum} ${previousQuarterYear}`,
    matchingQuarter: `Q${quarterNum} ${year - 1}`,
  }
}

export function json(value) {
  return JSON.stringify(value ?? null)
}
