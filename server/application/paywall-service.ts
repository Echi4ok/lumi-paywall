import type {
  PurchaseReceipt,
  PurchaseRequest,
  PurchaseResponse,
  RestoreResponse,
} from '../../shared/contracts/paywall'
import { findOffer, listOffers } from '../domain/offers'
import type { Purchase, PurchaseRepository } from '../domain/purchase'

interface Dependencies {
  purchases: PurchaseRepository
  now: () => Date
  newId: () => string
}

function receipt(purchase: Purchase): PurchaseReceipt {
  return {
    id: purchase.id,
    requestId: purchase.requestId,
    offerId: purchase.offerId,
    purchasedAt: purchase.purchasedAt.toISOString(),
    expiresAt: purchase.expiresAt.toISOString(),
  }
}

export function getOffers() {
  return { offers: listOffers() }
}

/** Use cases are independent of Nuxt, HTTP and the database driver. */
export function createPaywallService({ purchases, now, newId }: Dependencies) {
  return {
    async purchase(deviceId: string, input: PurchaseRequest): Promise<PurchaseResponse> {
      const offer = findOffer(input.offerId)
      const purchasedAt = now()
      const result = await purchases.createOrReplay({
        id: newId(),
        deviceId,
        requestId: input.requestId,
        offerId: offer.id,
        priceMinor: offer.priceMinor,
        currency: offer.currency,
        purchasedAt,
        expiresAt: new Date(purchasedAt.getTime() + offer.durationDays * 86_400_000),
      })
      return {
        purchase: receipt(result.purchase),
        replayed: result.replayed,
        active: result.purchase.expiresAt.getTime() > now().getTime(),
      }
    },

    async restore(deviceId: string): Promise<RestoreResponse> {
      const purchase = await purchases.findActiveByDevice(deviceId, now())
      return { purchase: purchase ? receipt(purchase) : null }
    },
  }
}

export type PaywallService = ReturnType<typeof createPaywallService>
