import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  loadMigrations,
  migrationStatements,
  verifyMigrations,
  type Migration,
} from '../../server/infrastructure/database/migrations'

let pg: PGlite
const migrations = await loadMigrations(fileURLToPath(new URL('../../migrations', import.meta.url)))
const db = {
  query: async <Row>(sql: string, parameters: unknown[] = []) =>
    (await pg.query<Row>(sql, parameters)).rows,
}
async function apply(list: Migration[] = migrations) {
  await pg.transaction(async (transaction) => {
    for (const sql of migrationStatements(list)) await transaction.query(sql)
  })
}
beforeAll(async () => {
  pg = await PGlite.create()
}, 30_000)
beforeEach(async () => {
  await pg.exec(
    'DROP TABLE IF EXISTS purchases, rate_limit_buckets, schema_migrations, temporary_migration_table',
  )
})
afterAll(async () => {
  await pg?.close()
})

describe('versioned migrations on Postgres', () => {
  it('applies ordered migrations and verifies checksums without changing the ledger on rerun', async () => {
    await apply()
    await verifyMigrations(db, migrations)
    const initial = await pg.query('SELECT * FROM schema_migrations ORDER BY id')
    await apply()
    expect((await pg.query('SELECT * FROM schema_migrations ORDER BY id')).rows).toEqual(
      initial.rows,
    )
  })

  it('adopts the original deployment schema without deleting purchases', async () => {
    await pg.exec(migrations[0]!.sql)
    await pg.exec(
      "INSERT INTO purchases VALUES ('3a320d0b-c355-43d7-b29c-7d24bfba94c8', '41f141ce-f340-4a98-91c4-e2b62c62940d', '9cf21181-7784-4e57-925f-0c3bfdf1f7bd', 'monthly', 29900, 'RUB', '2026-01-01', '2026-01-31')",
    )
    await apply()
    expect(
      (await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM purchases')).rows[0]
        ?.count,
    ).toBe(1)
  })

  it('refuses modified applied migrations', async () => {
    await apply()
    const changed = migrations.map((migration, index) =>
      index ? migration : { ...migration, checksum: 'changed' },
    )
    await expect(apply(changed)).rejects.toThrow('checksum mismatch')
    await verifyMigrations(db, migrations)
    await expect(verifyMigrations(db, changed)).rejects.toThrow('checksum mismatch')
  })

  it('rolls back the full migration transaction on failure', async () => {
    await expect(
      apply([
        ...migrations,
        {
          id: '003_invalid',
          checksum: 'bad',
          sql: 'CREATE TABLE temporary_migration_table (id integer); SELECT missing_function();',
        },
      ]),
    ).rejects.toThrow()
    expect(
      (
        await pg.query<{ name: string | null }>(
          "SELECT to_regclass('schema_migrations')::text AS name",
        )
      ).rows[0]?.name,
    ).toBeNull()
    expect(
      (
        await pg.query<{ name: string | null }>(
          "SELECT to_regclass('temporary_migration_table')::text AS name",
        )
      ).rows[0]?.name,
    ).toBeNull()
  })

  it('refuses unknown history and fails a stale runtime schema check', async () => {
    await apply([migrations[0]!])
    await expect(verifyMigrations(db)).rejects.toThrow('not current')
    await pg.exec("INSERT INTO schema_migrations (id, checksum) VALUES ('999_unknown', 'unknown')")
    await expect(apply()).rejects.toThrow('Unknown migration')
  })

  it('detects a missing required index despite a complete migration ledger', async () => {
    await apply()
    await pg.exec('DROP INDEX purchases_device_expiry_idx')
    await expect(verifyMigrations(db)).rejects.toThrow('indexes are missing')
  })
})
