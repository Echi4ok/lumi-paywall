import { randomUUID } from 'node:crypto'
import { createPaywallService } from '../application/paywall-service'
import { createDatabase } from './database/create-database'
import type { SqlClient } from './database/sql-client'
import { SqlPurchaseRepository } from './sql-purchase-repository'
import { SqlRateLimiter } from './sql-rate-limiter'
import { verifyMigrations } from './database/migrations'
import { createReadinessChecker } from './readiness'

// Retain the local connection through Nitro development hot reloads as well.
const runtime = globalThis as typeof globalThis & { __lumiDatabase?: Promise<SqlClient> }

async function getDatabase() {
  runtime.__lumiDatabase ??= createDatabase().catch((error: unknown) => {
    runtime.__lumiDatabase = undefined
    throw error
  })
  return runtime.__lumiDatabase
}

export async function getPaywallService() {
  return createPaywallService({
    purchases: new SqlPurchaseRepository(await getDatabase()),
    now: () => new Date(),
    newId: randomUUID,
  })
}

export async function getRateLimiter() {
  return new SqlRateLimiter(await getDatabase())
}

export const checkDatabaseHealth = createReadinessChecker({
  audit: async () => verifyMigrations(await getDatabase()),
  probe: async () => (await getDatabase()).query('SELECT 1'),
})
