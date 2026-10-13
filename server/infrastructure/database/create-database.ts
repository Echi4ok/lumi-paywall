import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'
import type { SqlClient } from './sql-client'

export async function createDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SqlClient> {
  if (environment.DATABASE_URL) {
    const sql = neon(environment.DATABASE_URL)
    return {
      async query<Row>(statement: string, parameters: unknown[] = []) {
        return (await sql.query(statement, parameters, {
          fetchOptions: { signal: AbortSignal.timeout(10_000) },
        })) as Row[]
      },
    }
  }
  // A serverless /tmp database would silently lose purchases between invocations.
  if (environment.NODE_ENV === 'production' || environment.VERCEL) {
    throw new Error('DATABASE_URL is required in production')
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const dataDir = resolve(environment.LOCAL_DATABASE_PATH || '.data/lumi')
  await mkdir(dataDir, { recursive: true })
  const pg = await PGlite.create(dataDir)
  try {
    // Local convenience only, once per process. Deployments use npm run db:migrate.
    await pg.exec(await readFile(resolve('migrations/001_purchases.sql'), 'utf8'))
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
