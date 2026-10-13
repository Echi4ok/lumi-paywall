import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    'Set DATABASE_URL before running production migrations. Local dev migrates automatically.',
  )
}
const migration = await readFile(
  new URL('../migrations/001_purchases.sql', import.meta.url),
  'utf8',
)
const sql = neon(connectionString)
// The initial migration is intentionally rerunnable; both DDL statements commit together.
const statements = migration
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean)
await sql.transaction(statements.map((statement) => sql.query(statement)))
console.info('Applied 001_purchases.sql')
