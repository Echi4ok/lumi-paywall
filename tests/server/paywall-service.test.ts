import { describe, expect, it, vi } from 'vitest'
import { createPaywallService, getOffers } from '../../server/application/paywall-service'
import { findOffer } from '../../server/domain/offers'
import type { Purchase, PurchaseRepository } from '../../server/domain/purchase'

const deviceId = 'cb690dc1-0f37-465b-82e4-1f099764ef27'
const requestId = '9bf38309-e901-4dc9-b29e-5ba7cba4f2ef'
const purchaseId = 'c1aef97b-ccdb-43e3-8f54-e1f106320cf3'
const now = new Date('2026-10-13T11:00:00.000Z')

function setup() {
  const purchases: PurchaseRepository = {
    createOrReplay: vi.fn(async (purchase: Purchase) => ({ purchase, replayed: false })),
    findActiveByDevice: vi.fn(async () => null),
  }
  return {
    purchases,
    service: createPaywallService({ purchases, now: () => now, newId: () => purchaseId }),
  }
}

describe('paywall use cases', () => {
  it('lists two immutable offers and recommends annual access', () => {
    const response = getOffers()
    expect(response.offers).toMatchObject([
      { id: 'monthly', priceMinor: 29900, durationDays: 30, recommended: false },
      { id: 'yearly', priceMinor: 179000, durationDays: 365, recommended: true },
    ])
    response.offers[0]!.priceMinor = 1
    expect(findOffer('monthly').priceMinor).toBe(29900)
  })

  it.each([
    ['monthly', 29900, '2026-11-12T11:00:00.000Z'],
    ['yearly', 179000, '2027-10-13T11:00:00.000Z'],
  ] as const)(
    'creates %s using the server catalog, with an exact UTC duration',
    async (offerId, priceMinor, expiresAt) => {
      const { service, purchases } = setup()
      const result = await service.purchase(deviceId, { offerId, requestId })
      expect(purchases.createOrReplay).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId, requestId, priceMinor, currency: 'RUB' }),
      )
      expect(result).toEqual({
        purchase: { id: purchaseId, requestId, offerId, purchasedAt: now.toISOString(), expiresAt },
        replayed: false,
        active: true,
      })
      expect(result.purchase).not.toHaveProperty('deviceId')
    },
  )

  it('rejects an unknown offer before storage', async () => {
    const { service, purchases } = setup()
    await expect(
      service.purchase(deviceId, { offerId: 'forged' as 'yearly', requestId }),
    ).rejects.toMatchObject({ code: 'INVALID_OFFER' })
    expect(purchases.createOrReplay).not.toHaveBeenCalled()
  })

  it('returns stored timestamps on replay, not dates from the retry', async () => {
    const { service, purchases } = setup()
    vi.mocked(purchases.createOrReplay).mockResolvedValue({
      purchase: {
        id: purchaseId,
        deviceId,
        requestId,
        offerId: 'monthly',
        priceMinor: 29900,
        currency: 'RUB',
        purchasedAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2026-10-31T00:00:00Z'),
      },
      replayed: true,
    })
    const result = await service.purchase(deviceId, { offerId: 'monthly', requestId })
    expect(result.replayed).toBe(true)
    expect(result.purchase.purchasedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('restores only the current device at the current time', async () => {
    const { service, purchases } = setup()
    expect(await service.restore(deviceId)).toEqual({ purchase: null })
    expect(purchases.findActiveByDevice).toHaveBeenCalledWith(deviceId, now)
  })

  it('does not turn database failures into success', async () => {
    const { service, purchases } = setup()
    vi.mocked(purchases.createOrReplay).mockRejectedValue(new Error('database offline'))
    await expect(service.purchase(deviceId, { offerId: 'monthly', requestId })).rejects.toThrow(
      'database offline',
    )
  })

  it('marks an expired replay inactive without changing its receipt', async () => {
    const { service, purchases } = setup()
    vi.mocked(purchases.createOrReplay).mockResolvedValue({
      purchase: {
        id: purchaseId,
        deviceId,
        requestId,
        offerId: 'monthly',
        priceMinor: 29900,
        currency: 'RUB',
        purchasedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: now,
      },
      replayed: true,
    })
    const result = await service.purchase(deviceId, { offerId: 'monthly', requestId })
    expect(result).toMatchObject({
      active: false,
      replayed: true,
      purchase: { requestId, expiresAt: now.toISOString() },
    })
  })
})
