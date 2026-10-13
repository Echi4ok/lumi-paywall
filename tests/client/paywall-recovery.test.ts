import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaywallApi } from '../../app/features/paywall/api/paywall-api'
import { createPurchaseAttempts } from '../../app/features/paywall/api/purchase-attempts'
import { usePaywall } from '../../app/features/paywall/composables/usePaywall'
import { createPaywallService, getOffers } from '../../server/application/paywall-service'
import { SqlPurchaseRepository } from '../../server/infrastructure/sql-purchase-repository'

let pg: PGlite
let repository: SqlPurchaseRepository

beforeAll(async () => {
  pg = await PGlite.create()
  await pg.exec(
    await readFile(new URL('../../migrations/001_purchases.sql', import.meta.url), 'utf8'),
  )
  repository = new SqlPurchaseRepository({
    query: async <Row>(statement: string, parameters: unknown[] = []) =>
      (await pg.query<Row>(statement, parameters)).rows,
  })
}, 30_000)
beforeEach(async () => {
  await pg.exec('TRUNCATE purchases')
})
afterAll(async () => {
  await pg?.close()
})

function scenario() {
  let now = new Date('2026-10-13T12:00:00Z')
  let loseResponse = true
  const deviceId = randomUUID()
  const service = createPaywallService({ purchases: repository, now: () => now, newId: randomUUID })
  const purchase = vi.fn<PaywallApi['purchase']>(async (input) => {
    const result = await service.purchase(deviceId, input)
    if (loseResponse) {
      loseResponse = false
      throw new Error('Response lost after committed purchase')
    }
    return result
  })
  const api: PaywallApi = {
    offers: async () => getOffers(),
    purchase,
    restore: async () => service.restore(deviceId),
  }
  const stored = new Map<string, string>()
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  }
  return {
    purchase,
    makeFlow: () => usePaywall(api, randomUUID, createPurchaseAttempts(storage)),
    expire: () => {
      now = new Date('2026-11-14T12:00:00Z')
    },
  }
}

describe('purchase recovery against persisted SQL receipts', () => {
  it('buys a new period after a lost response, confirmed restore, reload and expiry', async () => {
    const state = scenario()
    const first = state.makeFlow()
    await first.load()
    first.select('monthly')
    await first.purchase()
    expect(first.error.value?.scope).toBe('purchase')
    await first.restore()
    const oldReceipt = first.receipt.value!
    first.dispose()

    state.expire()
    const reloaded = state.makeFlow()
    await reloaded.load()
    reloaded.select('monthly')
    await reloaded.restore()
    expect(reloaded.receipt.value).toBeNull()
    await reloaded.purchase()

    expect(state.purchase.mock.calls[1]![0].requestId).not.toBe(oldReceipt.requestId)
    expect(reloaded.receipt.value?.id).not.toBe(oldReceipt.id)
    expect(reloaded.receipt.value?.expiresAt).toBe('2026-12-14T12:00:00.000Z')
    expect((await pg.query('SELECT count(*)::int AS n FROM purchases')).rows[0]?.n).toBe(2)
  })

  it('resolves a legacy expired attempt before a separate click can create a new purchase', async () => {
    const state = scenario()
    const first = state.makeFlow()
    await first.load()
    first.select('monthly')
    await first.purchase()
    first.dispose()
    state.expire()

    const reloaded = state.makeFlow()
    await reloaded.load()
    reloaded.select('monthly')
    await reloaded.restore()
    expect(reloaded.receipt.value).toBeNull()
    await reloaded.purchase()

    expect(state.purchase.mock.calls[1]![0]).toEqual(state.purchase.mock.calls[0]![0])
    expect(reloaded.receipt.value).toBeNull()
    expect(reloaded.notice.value).toContain('Срок этой покупки уже истёк')
    expect(state.purchase).toHaveBeenCalledTimes(2)
    expect((await pg.query('SELECT count(*)::int AS n FROM purchases')).rows[0]?.n).toBe(1)

    await reloaded.purchase()
    expect(state.purchase.mock.calls[2]![0].requestId).not.toBe(
      state.purchase.mock.calls[1]![0].requestId,
    )
    expect(reloaded.receipt.value?.expiresAt).toBe('2026-12-14T12:00:00.000Z')
    expect((await pg.query('SELECT count(*)::int AS n FROM purchases')).rows[0]?.n).toBe(2)
  })
})
