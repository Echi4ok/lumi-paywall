import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SqlClient } from './sql-client'
import { createExternalDatabase } from './external-database'
import { loadMigrations, migrationStatements, verifyMigrations } from './migrations'
import { operationalError } from '../diagnostics'

export async function createDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SqlClient> {
  if (environment.DATABASE_URL) {
    const db = await createExternalDatabase(environment)
    try {
      await verifyMigrations(db)
      return db
    } catch (error) {
      await db.close()
      throw error
    }
  }
  // A serverless /tmp database would silently lose purchases between invocations.
  if (environment.NODE_ENV === 'production' || environment.VERCEL) {
    throw operationalError('CONFIGURATION_ERROR', 'DATABASE_URL is required in production')
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const dataDir = resolve(environment.LOCAL_DATABASE_PATH || '.data/lumi')
  await mkdir(dataDir, { recursive: true })
  const pg = await PGlite.create(dataDir)
  try {
    // Local convenience only, once per process. Deployments use npm run db:migrate.
    const migrations = await loadMigrations(resolve('migrations'))
    await pg.transaction(async (transaction) => {
      for (const statement of migrationStatements(migrations)) await transaction.query(statement)
    })
  } catch (error) {
    await pg.close()
    throw error
  }
  return {
    async query<Row>(statement: string, parameters: unknown[] = []) {
      return (await pg.query<Row>(statement, parameters)).rows
    },
  }
}
