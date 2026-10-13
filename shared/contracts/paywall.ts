export interface Offer {
  id: 'monthly' | 'yearly'
  title: string
  durationDays: number
  priceMinor: number
  currency: 'RUB'
  recommended: boolean
}

export interface OffersResponse {
  offers: Offer[]
}
export interface PurchaseRequest {
  offerId: Offer['id']
  requestId: string
}
export interface PurchaseReceipt {
  id: string
  requestId: string
  offerId: Offer['id']
  purchasedAt: string
  expiresAt: string
}
export interface PurchaseResponse {
  purchase: PurchaseReceipt
  replayed: boolean
  active: boolean
}
export interface RestoreResponse {
  purchase: PurchaseReceipt | null
}
export interface ApiErrorData {
  code: string
  message: string
}
