import type { Offer } from '#shared/contracts/paywall'

const key = 'lumi.purchase-attempts.v1'
type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Same-tab recovery stores only unconfirmed request IDs, never device tokens or receipts. */
export function createPurchaseAttempts(storage?: AttemptStorage) {
  const attempts = new Map<Offer['id'], string>()
  try {
    storage ??= typeof window !== 'undefined' ? window.sessionStorage : undefined
    const saved: unknown = JSON.parse(storage?.getItem(key) ?? '{}')
    if (saved && typeof saved === 'object') {
      for (const offerId of ['monthly', 'yearly'] as const) {
        const value = (saved as Record<string, unknown>)[offerId]
        if (typeof value === 'string' && uuid.test(value)) attempts.set(offerId, value)
      }
    }
  } catch {
    /* In-memory retry still works when webview storage is unavailable. */
  }

  function persist() {
    try {
      if (attempts.size) storage?.setItem(key, JSON.stringify(Object.fromEntries(attempts)))
      else storage?.removeItem(key)
    } catch {
      /* Private browsing or quota restrictions must not block a purchase. */
    }
  }

  return {
    get(offerId: Offer['id']) {
      return attempts.get(offerId)
    },
    set(offerId: Offer['id'], requestId: string) {
      attempts.set(offerId, requestId)
      persist()
    },
    delete(offerId: Offer['id']) {
      attempts.delete(offerId)
      persist()
    },
  }
}
