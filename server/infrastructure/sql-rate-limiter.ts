import type { SqlClient } from './database/sql-client'

export interface RateLimitBucket {
  key: string
  limit: number
}
export interface RateLimitResult {
  allowed: boolean
  retryAfter: number
}

/** The broadest gate runs first so rejected traffic cannot allocate arbitrary device rows. */
export class SqlRateLimiter {
  constructor(private readonly db: SqlClient) {}

  async consume(
    buckets: readonly [RateLimitBucket, RateLimitBucket, RateLimitBucket],
  ): Promise<RateLimitResult> {
    const values: unknown[] = []
    const gates = buckets.map((bucket, index) => {
      values.push(bucket.key, bucket.limit)
      const key = `$${index * 2 + 1}`
      const limit = `$${index * 2 + 2}`
      const previous = index
        ? `JOIN gate_${index - 1} ON gate_${index - 1}.hits <= $${index * 2}`
        : ''
      return `gate_${index} AS (
        INSERT INTO rate_limit_buckets (bucket_key, window_number, hits, expires_at)
        SELECT ${key}, clock.window_number, 1, clock.expires_at FROM clock ${previous} WHERE true
        ON CONFLICT (bucket_key) DO UPDATE SET
          window_number = EXCLUDED.window_number,
          hits = CASE WHEN rate_limit_buckets.window_number = EXCLUDED.window_number
            THEN LEAST(rate_limit_buckets.hits + 1, ${limit}::integer + 1) ELSE 1 END,
          expires_at = EXCLUDED.expires_at
        RETURNING hits
      )`
    })
    const rows = await this.db.query<{ allowed: boolean; retry_after: number }>(
      `
      WITH clock AS (
        SELECT floor(extract(epoch FROM CURRENT_TIMESTAMP) / 60)::bigint AS window_number,
          CURRENT_TIMESTAMP + interval '2 minutes' AS expires_at
      ), ${gates.join(', ')}, cleaned AS (
        DELETE FROM rate_limit_buckets WHERE bucket_key IN (
          SELECT bucket_key FROM rate_limit_buckets WHERE expires_at < CURRENT_TIMESTAMP AND bucket_key NOT IN ($1, $3, $5)
          ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
        ) AND (SELECT count(*) FROM gate_2) >= 0
      )
      SELECT EXISTS (SELECT 1 FROM gate_2 WHERE hits <= $6) AS allowed,
        greatest(1, ceil(60 - mod(extract(epoch FROM CURRENT_TIMESTAMP), 60)))::integer AS retry_after
    `,
      values,
    )
    if (!rows[0]) throw new Error('Rate limiter returned no result')
    return { allowed: rows[0].allowed, retryAfter: rows[0].retry_after }
  }
}
