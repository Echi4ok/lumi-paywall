import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { SqlRateLimiter } from '../../server/infrastructure/sql-rate-limiter'
import { clientAddress } from '../../server/http/rate-limit'

let pg: PGlite
let limiter: SqlRateLimiter
beforeAll(async () => {
  pg = await PGlite.create()
  await pg.exec(
    await readFile(new URL('../../migrations/002_rate_limits.sql', import.meta.url), 'utf8'),
  )
  limiter = new SqlRateLimiter({
    query: async <Row>(sql: string, parameters: unknown[] = []) =>
      (await pg.query<Row>(sql, parameters)).rows,
  })
}, 30_000)
beforeEach(async () => {
  // Transaction time is fixed, so a test cannot accidentally straddle a minute boundary.
  await pg.exec('BEGIN; TRUNCATE rate_limit_buckets')
})
afterEach(async () => {
  await pg.exec('ROLLBACK')
})
afterAll(async () => {
  await pg?.close()
})

const buckets = () =>
  [
    { key: 'global', limit: 100 },
    { key: 'ip', limit: 100 },
    { key: 'device', limit: 30 },
  ] as const

describe('distributed fixed-window limits (Postgres)', () => {
  it('allows exactly 30 concurrent requests for a device across limiter instances', async () => {
    const otherInstance = new SqlRateLimiter({
      query: async <Row>(sql: string, parameters: unknown[] = []) =>
        (await pg.query<Row>(sql, parameters)).rows,
    })
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        (index % 2 ? limiter : otherInstance).consume(buckets()),
      ),
    )
    expect(results.filter((result) => result.allowed)).toHaveLength(30)
    expect(results.every((result) => result.retryAfter >= 1 && result.retryAfter <= 60)).toBe(true)
    expect(
      (
        await pg.query<{ hits: number }>(
          "SELECT hits FROM rate_limit_buckets WHERE bucket_key = 'device'",
        )
      ).rows[0]?.hits,
    ).toBe(31)
  })

  it('blocks rotating UUIDs at the global gate without allocating new identity rows', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        limiter.consume([
          { key: 'global', limit: 2 },
          { key: `ip:${randomUUID()}`, limit: 100 },
          { key: `device:${randomUUID()}`, limit: 30 },
        ]),
      ),
    )
    expect(results.filter((result) => result.allowed)).toHaveLength(2)
    expect(
      (await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM rate_limit_buckets'))
        .rows[0]?.count,
    ).toBe(5)
  })

  it('blocks new devices sharing a saturated IP', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        limiter.consume([
          { key: 'global', limit: 100 },
          { key: 'shared-ip', limit: 3 },
          { key: randomUUID(), limit: 30 },
        ]),
      ),
    )
    expect(results.filter((result) => result.allowed)).toHaveLength(3)
    expect(
      (await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM rate_limit_buckets'))
        .rows[0]?.count,
    ).toBe(5)
  })

  it('resets a previous window using database time', async () => {
    await limiter.consume(buckets())
    await pg.exec(
      "UPDATE rate_limit_buckets SET window_number = window_number - 1, hits = 100, expires_at = CURRENT_TIMESTAMP - interval '1 minute'",
    )
    expect((await limiter.consume(buckets())).allowed).toBe(true)
    expect(
      (await pg.query<{ hits: number }>('SELECT hits FROM rate_limit_buckets')).rows.every(
        (row) => row.hits === 1,
      ),
    ).toBe(true)
  })

  it('cleans expired buckets in bounded batches without deleting current gates', async () => {
    await pg.exec(
      "INSERT INTO rate_limit_buckets SELECT 'old:' || i, 1, 1, CURRENT_TIMESTAMP - interval '1 hour' FROM generate_series(1, 201) AS i",
    )
    await limiter.consume(buckets())
    expect(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM rate_limit_buckets WHERE bucket_key LIKE 'old:%'",
        )
      ).rows[0]?.count,
    ).toBe(101)
    await limiter.consume(buckets())
    expect(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM rate_limit_buckets WHERE bucket_key LIKE 'old:%'",
        )
      ).rows[0]?.count,
    ).toBe(1)
  })
})

describe('proxy trust boundary', () => {
  const event = {
    node: {
      req: {
        headers: { 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': '198.51.100.1' },
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      },
    },
  } as unknown as H3Event
  it('ignores spoofed forwarding outside the production Vercel ingress', () => {
    expect(clientAddress(event, { NODE_ENV: 'production' })).toBe('127.0.0.1')
    expect(clientAddress(event, { NODE_ENV: 'development', VERCEL: '1' })).toBe('127.0.0.1')
  })
  it('uses the platform-owned header only on production Vercel', () => {
    expect(clientAddress(event, { NODE_ENV: 'production', VERCEL: '1' })).toBe('203.0.113.5')
  })
})
