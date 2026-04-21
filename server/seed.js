import fs from 'fs'
import path from 'path'
import { loadDb } from './dataStore.js'

const dbPath = path.resolve('server/data/db.json')
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
const db = loadDb()
console.log(`Seeded ${db.shopStockLines.length} shop stock lines, ${db.imports.length} imports.`)
