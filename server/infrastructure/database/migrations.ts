import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SqlClient } from './sql-client'
import { operationalError } from '../diagnostics.ts'

export const REQUIRED_MIGRATIONS = ['001_purchases', '002_rate_limits'] as const
export interface Migration {
  id: string
  checksum: string
  sql: string
}

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
  if (!files.length) throw operationalError('MIGRATION_INVALID', 'No migrations found')
  return Promise.all(
    files.map(async (name, index) => {
      const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name)
      if (!match || Number(match[1]) !== index + 1)
        throw operationalError('MIGRATION_INVALID', 'Migration order must be contiguous')
      const sql = (await readFile(join(directory, name), 'utf8')).replace(/\r\n/g, '\n').trim()
      if (!sql) throw operationalError('MIGRATION_INVALID', 'Empty migration')
      return {
        id: name.slice(0, -4),
        checksum: createHash('sha256').update(sql).digest('hex'),
        sql,
      }
    }),
  )
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

/** One transaction and advisory lock serialize migration runners. */
export function migrationStatements(migrations: Migration[]): string[] {
  const known = migrations.map((migration) => literal(migration.id)).join(', ')
  return [
    'SELECT pg_advisory_xact_lock(1648632791)',
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `DO $ledger$ BEGIN
      IF EXISTS (SELECT 1 FROM schema_migrations WHERE id NOT IN (${known})) THEN
        RAISE EXCEPTION 'Unknown migration in database';
      END IF;
    END $ledger$`,
    ...migrations.map((migration) => {
      const delimiter = `$migration_${migration.checksum.slice(0, 12)}$`
      if (migration.sql.includes(delimiter))
        throw operationalError('MIGRATION_INVALID', 'Invalid migration delimiter')
      return `DO ${delimiter}
      DECLARE previous_checksum TEXT;
      BEGIN
        SELECT checksum INTO previous_checksum FROM schema_migrations WHERE id = ${literal(migration.id)};
        IF FOUND THEN
          IF previous_checksum <> ${literal(migration.checksum)} THEN
            RAISE EXCEPTION 'Migration checksum mismatch: %', ${literal(migration.id)};
          END IF;
        ELSE
          IF EXISTS (SELECT 1 FROM schema_migrations WHERE id > ${literal(migration.id)}) THEN
            RAISE EXCEPTION 'Migration history is out of order';
          END IF;
          ${migration.sql}
          INSERT INTO schema_migrations (id, checksum) VALUES (${literal(migration.id)}, ${literal(migration.checksum)});
        END IF;
      END ${delimiter}`
    }),
  ]
}

export async function verifyMigrations(db: SqlClient, migrations?: Migration[]): Promise<void> {
  const rows = await db.query<{ id: string; checksum: string }>(
    'SELECT id, checksum FROM schema_migrations ORDER BY id',
  )
  const expected = migrations?.map((migration) => migration.id) || [...REQUIRED_MIGRATIONS]
  if (rows.length !== expected.length || rows.some((row, index) => row.id !== expected[index]))
    throw operationalError('SCHEMA_MISMATCH', 'Database migrations are not current')
  if (migrations && rows.some((row, index) => row.checksum !== migrations[index]?.checksum))
    throw operationalError('SCHEMA_MISMATCH', 'Migration checksum mismatch')
  // Detect common schema drift even if a ledger entry was copied or retained.
  await db.query(
    'SELECT id, device_id, request_id, offer_id, price_minor, currency, purchased_at, expires_at FROM purchases WHERE false',
  )
  if (expected.includes('002_rate_limits')) {
    await db.query(
      'SELECT bucket_key, window_number, hits, expires_at FROM rate_limit_buckets WHERE false',
    )
    const indexes = await db.query<{
      indexname: string
    }>(`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
      AND indexname IN ('purchases_pkey', 'purchases_device_request_unique', 'purchases_device_expiry_idx', 'rate_limit_buckets_pkey', 'rate_limit_buckets_expiry_idx')`)
    if (indexes.length !== 5)
      throw operationalError('SCHEMA_MISMATCH', 'Required database indexes are missing')
  }
}
