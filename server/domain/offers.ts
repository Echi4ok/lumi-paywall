import type { Offer } from '../../shared/contracts/paywall'
import { DomainError } from './errors'

const catalog: readonly Readonly<Offer>[] = Object.freeze([
  Object.freeze({
    id: 'monthly',
    title: 'На один месяц',
    durationDays: 30,
    priceMinor: 29900,
    currency: 'RUB',
    recommended: false,
  }),
  Object.freeze({
    id: 'yearly',
    title: 'На целый год',
    durationDays: 365,
    priceMinor: 179000,
    currency: 'RUB',
    recommended: true,
  }),
])

export function listOffers(): Offer[] {
  return catalog.map((offer) => ({ ...offer }))
}

export function findOffer(id: string): Readonly<Offer> {
  const offer = catalog.find((item) => item.id === id)
  if (!offer) throw new DomainError('INVALID_OFFER')
  return offer
}
