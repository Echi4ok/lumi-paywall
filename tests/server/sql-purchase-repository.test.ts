import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SqlPurchaseRepository } from '../../server/infrastructure/sql-purchase-repository'
import type { Purchase } from '../../server/domain/purchase'

let pg: PGlite
let repository: SqlPurchaseRepository
const deviceId = randomUUID()
const now = new Date('2026-10-13T11:00:00.000Z')
const migration = await readFile(
  new URL('../../migrations/001_purchases.sql', import.meta.url),
  'utf8',
)

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: randomUUID(),
    deviceId,
    requestId: randomUUID(),
    offerId: 'yearly',
    priceMinor: 179000,
    currency: 'RUB',
    purchasedAt: now,
    expiresAt: new Date('2027-10-13T11:00:00.000Z'),
    ...overrides,
  }
}

beforeAll(async () => {
  pg = await PGlite.create()
  await pg.exec(migration)
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

describe('Postgres purchase repository (real PGlite)', () => {
  it('persists every receipt field and restores it', async () => {
    const input = purchase()
    expect(await repository.createOrReplay(input)).toEqual({ purchase: input, replayed: false })
    expect(await repository.findActiveByDevice(deviceId, now)).toEqual(input)
  })

  it('atomically deduplicates concurrent retries and preserves the first receipt', async () => {
    const requestId = randomUUID()
    const results = await Promise.all(
      Array.from({ length: 12 }, () => repository.createOrReplay(purchase({ requestId }))),
    )
    expect(results.filter((result) => !result.replayed)).toHaveLength(1)
    expect(new Set(results.map((result) => result.purchase.id)).size).toBe(1)
    expect(
      (await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM purchases')).rows[0]
        ?.count,
    ).toBe(1)
  })

  it('returns original dates and price when a retry arrives later', async () => {
    const original = purchase()
    await repository.createOrReplay(original)
    const result = await repository.createOrReplay(
      purchase({
        requestId: original.requestId,
        priceMinor: 1,
        purchasedAt: new Date('2026-10-20T11:00:00Z'),
        expiresAt: new Date('2027-10-20T11:00:00Z'),
      }),
    )
    expect(result).toEqual({ purchase: original, replayed: true })
  })

  it('rejects reuse of an idempotency key for a different offer', async () => {
    const original = purchase()
    await repository.createOrReplay(original)
    await expect(
      repository.createOrReplay(purchase({ requestId: original.requestId, offerId: 'monthly' })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await repository.findActiveByDevice(deviceId, now)).toEqual(original)
  })

  it('scopes both restoration and idempotency to the device', async () => {
    const original = purchase()
    const anotherDevice = randomUUID()
    await repository.createOrReplay(original)
    expect(await repository.findActiveByDevice(anotherDevice, now)).toBeNull()
    const result = await repository.createOrReplay(
      purchase({ deviceId: anotherDevice, requestId: original.requestId }),
    )
    expect(result.replayed).toBe(false)
    expect(result.purchase.id).not.toBe(original.id)
  })

  it('does not restore an expired purchase, including the exact expiration instant', async () => {
    const original = purchase()
    await repository.createOrReplay(original)
    expect(
      await repository.findActiveByDevice(deviceId, new Date(original.expiresAt.getTime() - 1)),
    ).not.toBeNull()
    expect(await repository.findActiveByDevice(deviceId, original.expiresAt)).toBeNull()
    expect(
      await repository.findActiveByDevice(deviceId, new Date('2028-01-01T00:00:00Z')),
    ).toBeNull()
  })

  it('restores the longest active access even if a shorter plan was bought later', async () => {
    const annual = purchase()
    await repository.createOrReplay(annual)
    await repository.createOrReplay(
      purchase({
        offerId: 'monthly',
        purchasedAt: new Date('2026-10-14T11:00:00Z'),
        expiresAt: new Date('2026-11-13T11:00:00Z'),
      }),
    )
    expect(await repository.findActiveByDevice(deviceId, new Date('2026-10-15T00:00:00Z'))).toEqual(
      annual,
    )
  })

  it('reapplies the initial migration without losing data', async () => {
    const original = purchase()
    await repository.createOrReplay(original)
    await pg.exec(migration)
    expect(await repository.findActiveByDevice(deviceId, now)).toEqual(original)
  })

  it('enforces database constraints independently of application validation', async () => {
    await expect(repository.createOrReplay(purchase({ priceMinor: -1 }))).rejects.toThrow()
    await expect(repository.createOrReplay(purchase({ expiresAt: now }))).rejects.toThrow()
    expect(await repository.findActiveByDevice(deviceId, now)).toBeNull()
  })
})
