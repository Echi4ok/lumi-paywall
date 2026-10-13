import { fileURLToPath } from 'node:url'
import { createExternalDatabase } from '../server/infrastructure/database/external-database.ts'
import {
  loadMigrations,
  migrationStatements,
  verifyMigrations,
} from '../server/infrastructure/database/migrations.ts'
import { safeErrorDetails } from '../server/infrastructure/diagnostics.ts'

let stage = 'load'
try {
  const migrations = await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url)))
  stage = 'connect'
  const db = await createExternalDatabase({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  })
  try {
    stage = 'apply'
    if (!process.argv.includes('--check')) await db.transaction(migrationStatements(migrations))
    stage = 'verify'
    await verifyMigrations(db, migrations)
    console.info(
      `Verified ${migrations.length} migrations${process.argv.includes('--check') ? ' (read only)' : ''}`,
    )
  } finally {
    await db.close()
  }
} catch (error) {
  console.error('Migration failed', { stage, ...safeErrorDetails(error) })
  process.exitCode = 1
}
