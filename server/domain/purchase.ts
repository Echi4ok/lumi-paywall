import type { Offer } from '../../shared/contracts/paywall'

export interface Purchase {
  id: string
  deviceId: string
  requestId: string
  offerId: Offer['id']
  priceMinor: number
  currency: Offer['currency']
  purchasedAt: Date
  expiresAt: Date
}

export interface PurchaseResult {
  purchase: Purchase
  replayed: boolean
}

/** Implementations must atomically deduplicate by (deviceId, requestId).
 * Reusing that key for another offer must reject with IDEMPOTENCY_CONFLICT.
 */
export interface PurchaseRepository {
  createOrReplay(purchase: Purchase): Promise<PurchaseResult>
  findActiveByDevice(deviceId: string, at: Date): Promise<Purchase | null>
}
