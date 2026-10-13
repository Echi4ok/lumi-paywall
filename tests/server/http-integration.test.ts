import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import offers from '../../server/api/offers.get'
import purchase from '../../server/api/purchase.post'
import restore from '../../server/api/restore.post'
import health from '../../server/api/health.get'
import { createDatabase } from '../../server/infrastructure/database/create-database'
import {
  loadMigrations,
  migrationStatements,
} from '../../server/infrastructure/database/migrations'

vi.mock('../../server/infrastructure/database/create-database', () => ({ createDatabase: vi.fn() }))
let pg: PGlite
let server: Server
let origin: string
beforeAll(async () => {
  pg = await PGlite.create()
  const migrations = await loadMigrations(
    fileURLToPath(new URL('../../migrations', import.meta.url)),
  )
  await pg.transaction(async (tx) => {
    for (const sql of migrationStatements(migrations)) await tx.query(sql)
  })
  vi.mocked(createDatabase).mockResolvedValue({
    query: async <Row>(sql: string, parameters: unknown[] = []) =>
      (await pg.query<Row>(sql, parameters)).rows,
  })
  const app = createApp()
  app.use(
    createRouter()
      .get('/api/offers', offers)
      .post('/api/purchase', purchase)
      .post('/api/restore', restore)
      .get('/api/health', health),
  )
  server = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP server')
  origin = `http://127.0.0.1:${address.port}`
}, 30_000)
beforeEach(async () => {
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('RATE_LIMIT_SECRET', 'integration-test-only-secret')
  await pg.exec('BEGIN; TRUNCATE purchases, rate_limit_buckets')
})
afterEach(async () => {
  await pg.exec('ROLLBACK')
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
afterAll(async () => {
  server?.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await pg?.close()
})
const post = (path: string, cookie: string, body?: unknown) =>
  fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { origin, cookie, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

describe('actual handlers, service and Postgres together', () => {
  it('keeps a purchased device after any concurrent bootstrap response arrives', async () => {
    const bootstrap = randomUUID()
    const headers = { 'x-lumi-bootstrap': bootstrap }
    const [first, second] = await Promise.all([
      fetch(`${origin}/api/offers`, { headers }),
      fetch(`${origin}/api/offers`, { headers }),
    ])
    const firstCookie = first.headers.get('set-cookie')!.split(';')[0]!
    const secondCookie = second.headers.get('set-cookie')!.split(';')[0]!
    const input = { offerId: 'yearly', requestId: randomUUID() }
    const committed = await (await post('/api/purchase', firstCookie, input)).json()
    const restored = await (await post('/api/restore', secondCookie)).json()
    expect(restored.purchase.id).toBe(committed.purchase.id)
    expect(restored.purchase.requestId).toBe(input.requestId)
  })

  it('persists one receipt through 12 concurrent retries under the distributed limit', async () => {
    const cookie = `lumi_device=${randomUUID()}`
    const input = { offerId: 'yearly', requestId: randomUUID() }
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => post('/api/purchase', cookie, input)),
    )
    expect(responses.every((response) => response.status === 200)).toBe(true)
    const receipts = await Promise.all(responses.map((response) => response.json()))
    expect(new Set(receipts.map((response) => response.purchase.id)).size).toBe(1)
    expect(receipts.filter((response) => !response.replayed)).toHaveLength(1)
    const retry = await (await post('/api/purchase', cookie, input)).json()
    expect(retry).toMatchObject({
      replayed: true,
      active: true,
      purchase: { requestId: input.requestId },
    })
  })

  it('returns 429 after the device budget and does not persist rejected purchases', async () => {
    const cookie = `lumi_device=${randomUUID()}`
    const responses = await Promise.all(
      Array.from({ length: 35 }, () =>
        post('/api/purchase', cookie, { offerId: 'monthly', requestId: randomUUID() }),
      ),
    )
    expect(responses.filter((response) => response.status === 200)).toHaveLength(30)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(5)
    expect(
      (await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM purchases')).rows[0]
        ?.count,
    ).toBe(30)
    expect(
      responses.find((response) => response.status === 429)?.headers.get('retry-after'),
    ).toMatch(/^\d+$/)
  })

  it('returns safe readiness and detects schema drift without leaking database details', async () => {
    let healthTime = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => healthTime)
    const ready = await fetch(`${origin}/api/health`)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ status: 'ok' })
    await pg.exec('SAVEPOINT drift; ALTER TABLE rate_limit_buckets RENAME TO unavailable_buckets')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const cached = await fetch(`${origin}/api/health`)
      expect(cached.status).toBe(200)
      healthTime += 30_000
      const failed = await fetch(`${origin}/api/health`)
      expect(failed.status).toBe(503)
      expect(await failed.text()).not.toContain('unavailable_buckets')
      expect(log).toHaveBeenCalled()
    } finally {
      await pg.exec('ROLLBACK TO SAVEPOINT drift')
    }
  })

  it('fails readiness when a deployed limiter secret is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RATE_LIMIT_SECRET', '')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await fetch(`${origin}/api/health`)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('RATE_LIMIT_SECRET')
    expect(log).toHaveBeenCalledWith(
      '[paywall] Operation failed',
      expect.objectContaining({ code: 'CONFIGURATION_ERROR' }),
    )
  })
})
