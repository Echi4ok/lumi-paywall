import { DomainError } from '../domain/errors'
import type { Purchase, PurchaseRepository } from '../domain/purchase'
import type { SqlClient } from './database/sql-client'

interface PurchaseRow {
  id: string
  device_id: string
  request_id: string
  offer_id: Purchase['offerId']
  price_minor: number
  currency: Purchase['currency']
  purchased_at: string | Date
  expires_at: string | Date
}

function toDomain(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    deviceId: row.device_id,
    requestId: row.request_id,
    offerId: row.offer_id,
    priceMinor: row.price_minor,
    currency: row.currency,
    purchasedAt: new Date(row.purchased_at),
    expiresAt: new Date(row.expires_at),
  }
}

export class SqlPurchaseRepository implements PurchaseRepository {
  constructor(private readonly db: SqlClient) {}

  async createOrReplay(purchase: Purchase) {
    // A single statement waits for competing inserts and returns the persisted
    // receipt. A SELECT after ON CONFLICT DO NOTHING would introduce a race.
    const rows = await this.db.query<PurchaseRow>(
      `
      INSERT INTO purchases (id, device_id, request_id, offer_id, price_minor, currency, purchased_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (device_id, request_id) DO UPDATE
      SET request_id = purchases.request_id
      WHERE purchases.offer_id = EXCLUDED.offer_id
      RETURNING id, device_id, request_id, offer_id, price_minor, currency, purchased_at, expires_at
    `,
      [
        purchase.id,
        purchase.deviceId,
        purchase.requestId,
        purchase.offerId,
        purchase.priceMinor,
        purchase.currency,
        purchase.purchasedAt.toISOString(),
        purchase.expiresAt.toISOString(),
      ],
    )
    const persisted = rows[0]
    if (!persisted) throw new DomainError('IDEMPOTENCY_CONFLICT')
    return { purchase: toDomain(persisted), replayed: persisted.id !== purchase.id }
  }

  async findActiveByDevice(deviceId: string, at: Date): Promise<Purchase | null> {
    const rows = await this.db.query<PurchaseRow>(
      `
      SELECT id, device_id, request_id, offer_id, price_minor, currency, purchased_at, expires_at
      FROM purchases
      WHERE device_id = $1 AND expires_at > $2
      ORDER BY expires_at DESC, purchased_at DESC, id DESC
      LIMIT 1
    `,
      [deviceId, at.toISOString()],
    )
    return rows[0] ? toDomain(rows[0]) : null
  }
}
