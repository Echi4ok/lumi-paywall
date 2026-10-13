import { randomUUID } from 'node:crypto'
import { createPaywallService } from '../application/paywall-service'
import { createDatabase } from './database/create-database'
import type { SqlClient } from './database/sql-client'
import { SqlPurchaseRepository } from './sql-purchase-repository'

// Retain the local connection through Nitro development hot reloads as well.
const runtime = globalThis as typeof globalThis & { __lumiDatabase?: Promise<SqlClient> }

export async function getPaywallService() {
  runtime.__lumiDatabase ??= createDatabase().catch((error: unknown) => {
    runtime.__lumiDatabase = undefined
    throw error
  })
  return createPaywallService({
    purchases: new SqlPurchaseRepository(await runtime.__lumiDatabase),
    now: () => new Date(),
    newId: randomUUID,
  })
}
