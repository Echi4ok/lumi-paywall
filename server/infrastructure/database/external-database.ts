import { neon } from '@neondatabase/serverless'
import type { SqlClient } from './sql-client'
import { operationalError, safeErrorDetails } from '../diagnostics.ts'

export interface MigrationClient extends SqlClient {
  transaction(statements: string[]): Promise<void>
  close(): Promise<void>
}

/** An explicit driver; deployed services never fall back to local storage. */
export async function createExternalDatabase(
  environment: NodeJS.ProcessEnv,
): Promise<MigrationClient> {
  const connectionString = environment.DATABASE_URL
  if (!connectionString) throw operationalError('CONFIGURATION_ERROR', 'DATABASE_URL is required')
  const driver = environment.DATABASE_DRIVER || 'neon'
  if (driver === 'postgres') {
    const { Pool } = await import('pg')
    const pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
      statement_timeout: 10_000,
    })
    pool.on('error', (error) => {
      console.error('[database] Idle connection failed', safeErrorDetails(error))
    })
    return {
      async query<Row>(statement: string, parameters: unknown[] = []) {
        return (await pool.query(statement, parameters)).rows as Row[]
      },
      async transaction(statements: string[]) {
        const connection = await pool.connect()
        try {
          await connection.query('BEGIN')
          for (const statement of statements) await connection.query(statement)
          await connection.query('COMMIT')
        } catch (error) {
          await connection.query('ROLLBACK')
          throw error
        } finally {
          connection.release()
        }
      },
      async close() {
        await pool.end()
      },
    }
  }
  if (driver !== 'neon')
    throw operationalError('CONFIGURATION_ERROR', 'Unsupported DATABASE_DRIVER')
  const sql = neon(connectionString)
  return {
    async query<Row>(statement: string, parameters: unknown[] = []) {
      return (await sql.query(statement, parameters, {
        fetchOptions: { signal: AbortSignal.timeout(10_000) },
      })) as Row[]
    },
    async transaction(statements: string[]) {
      await sql.transaction(
        statements.map((statement) => sql.query(statement)),
        { fetchOptions: { signal: AbortSignal.timeout(30_000) } },
      )
    },
    async close() {},
  }
}
