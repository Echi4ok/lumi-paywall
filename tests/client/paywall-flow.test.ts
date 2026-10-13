import { describe, expect, it, vi } from 'vitest'
import type { Offer, PurchaseResponse } from '#shared/contracts/paywall'
import type { PaywallApi } from '../../app/features/paywall/api/paywall-api'
import { usePaywall } from '../../app/features/paywall/composables/usePaywall'
import { PaywallApiError } from '../../app/features/paywall/api/api-error'
import { createPurchaseAttempts } from '../../app/features/paywall/api/purchase-attempts'

const firstRequestId = '11111111-2222-4333-8444-555555555555'
const secondRequestId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const offers: Offer[] = [
  {
    id: 'monthly',
    title: 'На один месяц',
    durationDays: 30,
    priceMinor: 29900,
    currency: 'RUB',
    recommended: false,
  },
  {
    id: 'yearly',
    title: 'На целый год',
    durationDays: 365,
    priceMinor: 179000,
    currency: 'RUB',
    recommended: true,
  },
]
const result: PurchaseResponse = {
  purchase: {
    id: 'receipt-1',
    requestId: firstRequestId,
    offerId: 'yearly',
    purchasedAt: '2026-10-13T12:00:00.000Z',
    expiresAt: '2027-10-13T12:00:00.000Z',
  },
  replayed: false,
  active: true,
}
function fixture(overrides: Partial<PaywallApi> = {}) {
  const api: PaywallApi = {
    offers: vi.fn().mockResolvedValue({ offers }),
    purchase: vi.fn().mockResolvedValue(result),
    restore: vi.fn().mockResolvedValue({ purchase: null }),
    ...overrides,
  }
  const createId = vi.fn().mockReturnValueOnce(firstRequestId).mockReturnValue(secondRequestId)
  return { api, createId, flow: usePaywall(api, createId) }
}

describe('paywall interaction flow', () => {
  it('selects the recommendation after loading and reports an empty catalog as recoverable error', async () => {
    const { flow } = fixture()
    await flow.load()
    expect(flow.selected.value?.id).toBe('yearly')
    expect(flow.busy.value).toBe(false)
    const empty = fixture({ offers: vi.fn().mockResolvedValue({ offers: [] }) })
    await empty.flow.load()
    expect(empty.flow.catalogError.value).toContain('Не удалось загрузить тарифы')
    expect(empty.flow.busy.value).toBe(false)
  })

  it('prevents duplicate taps, restore races, and selection changes during a purchase', async () => {
    let complete!: (value: PurchaseResponse) => void
    const { flow, api } = fixture({
      purchase: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      ),
    })
    await flow.load()
    const pending = flow.purchase()
    await flow.purchase()
    await flow.restore()
    flow.select('monthly')
    expect(api.purchase).toHaveBeenCalledTimes(1)
    expect(api.restore).not.toHaveBeenCalled()
    expect(flow.selectedId.value).toBe('yearly')
    complete(result)
    await pending
    expect(flow.receipt.value).toEqual(result.purchase)
    await flow.purchase()
    expect(api.purchase).toHaveBeenCalledTimes(1)
  })

  it('reuses the same idempotency key after an ambiguous timeout', async () => {
    const purchase = vi
      .fn()
      .mockRejectedValueOnce(new Error('Timeout after commit'))
      .mockResolvedValueOnce({ ...result, replayed: true })
    const { flow, createId } = fixture({ purchase })
    await flow.load()
    await flow.purchase()
    expect(flow.error.value?.scope).toBe('purchase')
    await flow.purchase()
    expect(purchase.mock.calls.map((call) => call[0])).toEqual([
      { offerId: 'yearly', requestId: firstRequestId },
      { offerId: 'yearly', requestId: firstRequestId },
    ])
    expect(createId).toHaveBeenCalledTimes(1)
    expect(flow.receipt.value).toEqual(result.purchase)
  })

  it('creates a new intent only when the user changes the tariff', async () => {
    const purchase = vi.fn().mockRejectedValue(new Error('Offline'))
    const { flow } = fixture({ purchase })
    await flow.load()
    await flow.purchase()
    flow.select('monthly')
    await flow.purchase()
    expect(purchase.mock.calls[1]![0]).toEqual({ offerId: 'monthly', requestId: secondRequestId })
  })

  it('retains uncertain purchase keys when switching away from a tariff and back', async () => {
    const purchase = vi
      .fn()
      .mockRejectedValueOnce(new Error('Committed but response lost'))
      .mockResolvedValueOnce(result)
    const { flow, createId } = fixture({ purchase })
    await flow.load()
    await flow.purchase()
    flow.select('monthly')
    flow.select('yearly')
    await flow.purchase()
    expect(purchase.mock.calls[0]![0]).toEqual(purchase.mock.calls[1]![0])
    expect(createId).toHaveBeenCalledTimes(1)
  })

  it('explains cookies and allows session reinitialization instead of a blind 401 retry', async () => {
    const purchase = vi.fn().mockRejectedValue(new PaywallApiError('SESSION_REQUIRED'))
    const { flow, api } = fixture({ purchase })
    await flow.load()
    flow.select('monthly')
    await flow.purchase()
    expect(flow.error.value?.code).toBe('SESSION_REQUIRED')
    expect(flow.error.value?.message).toContain('cookies')
    await flow.load()
    expect(api.offers).toHaveBeenCalledTimes(2)
    expect(flow.error.value).toBeNull()
    expect(flow.selectedId.value).toBe('monthly')
  })

  it('distinguishes no prior purchase from a restore failure and recovered access', async () => {
    const restore = vi
      .fn()
      .mockResolvedValueOnce({ purchase: null })
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ purchase: result.purchase })
    const { flow } = fixture({ restore })
    await flow.load()
    await flow.restore()
    expect(flow.notice.value).toContain('пока нет активных покупок')
    expect(flow.error.value).toBeNull()
    await flow.restore()
    expect(flow.notice.value).toBe('')
    expect(flow.error.value?.scope).toBe('restore')
    await flow.restore()
    expect(flow.error.value).toBeNull()
    expect(flow.restored.value).toBe(true)
    expect(flow.receipt.value).toEqual(result.purchase)
  })

  it('aborts requests and ignores late results after the view is disposed', async () => {
    let complete!: (value: PurchaseResponse) => void
    let signal: AbortSignal | undefined
    const purchase = vi.fn().mockImplementation((_input, suppliedSignal) => {
      signal = suppliedSignal
      return new Promise((resolve) => {
        complete = resolve
      })
    })
    const { flow } = fixture({ purchase })
    await flow.load()
    const pending = flow.purchase()
    flow.dispose()
    expect(signal?.aborted).toBe(true)
    complete(result)
    await pending
    expect(flow.receipt.value).toBeNull()
  })

  it('retires the matching restored attempt across reloads after a lost purchase response', async () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    }
    const { api } = fixture({
      purchase: vi.fn().mockRejectedValue(new Error('Response lost after commit')),
      restore: vi.fn().mockResolvedValue({ purchase: result.purchase }),
    })
    const initial = usePaywall(api, () => firstRequestId, createPurchaseAttempts(storage))
    await initial.load()
    await initial.purchase()
    expect(createPurchaseAttempts(storage).get('yearly')).toBe(firstRequestId)

    await initial.restore()
    expect(initial.receipt.value).toEqual(result.purchase)
    expect(createPurchaseAttempts(storage).get('yearly')).toBeUndefined()
    initial.dispose()

    const nextPurchase = vi.fn().mockResolvedValue({
      ...result,
      purchase: { ...result.purchase, id: 'receipt-2', requestId: secondRequestId },
    })
    const reloaded = usePaywall(
      { ...api, purchase: nextPurchase },
      () => secondRequestId,
      createPurchaseAttempts(storage),
    )
    await reloaded.load()
    await reloaded.purchase()
    expect(nextPurchase).toHaveBeenCalledWith(
      { offerId: 'yearly', requestId: secondRequestId },
      expect.any(AbortSignal),
    )
    expect(reloaded.receipt.value?.id).toBe('receipt-2')
  })

  it('keeps the uncertain key when restore finds another purchase of the same tariff', async () => {
    const attempts = createPurchaseAttempts()
    attempts.set('yearly', firstRequestId)
    const { api } = fixture({
      restore: vi.fn().mockResolvedValue({
        purchase: { ...result.purchase, requestId: secondRequestId },
      }),
    })
    const flow = usePaywall(api, () => secondRequestId, attempts)
    await flow.load()
    await flow.restore()
    expect(flow.restored.value).toBe(true)
    expect(attempts.get('yearly')).toBe(firstRequestId)
  })

  it('does not turn an expired replay into success or automatically buy a new period', async () => {
    const purchase = vi
      .fn()
      .mockResolvedValueOnce({ ...result, active: false, replayed: true })
      .mockResolvedValueOnce({
        ...result,
        purchase: { ...result.purchase, requestId: secondRequestId },
      })
    const attempts = createPurchaseAttempts()
    attempts.set('yearly', firstRequestId)
    const { api } = fixture({ purchase })
    const createId = vi.fn().mockReturnValue(secondRequestId)
    const flow = usePaywall(api, createId, attempts)
    await flow.load()

    await flow.purchase()
    expect(purchase).toHaveBeenCalledTimes(1)
    expect(createId).not.toHaveBeenCalled()
    expect(flow.receipt.value).toBeNull()
    expect(flow.notice.value).toContain('Срок этой покупки уже истёк')
    expect(flow.busy.value).toBe(false)
    expect(attempts.get('yearly')).toBeUndefined()

    await flow.purchase()
    expect(purchase).toHaveBeenCalledTimes(2)
    expect(purchase.mock.calls[1]![0].requestId).toBe(secondRequestId)
    expect(flow.receipt.value).toEqual({ ...result.purchase, requestId: secondRequestId })
  })

  it('uses the server access verdict even if the client clock would consider it expired', async () => {
    const { flow } = fixture({
      purchase: vi.fn().mockResolvedValue({
        ...result,
        purchase: { ...result.purchase, expiresAt: '2000-01-01T00:00:00Z' },
      }),
    })
    await flow.load()
    await flow.purchase()
    expect(flow.receipt.value?.expiresAt).toBe('2000-01-01T00:00:00Z')
    expect(flow.notice.value).toBe('')
  })

  it('restores access without a catalog and preserves catalog retry after an empty restore', async () => {
    const restore = vi
      .fn()
      .mockResolvedValueOnce({ purchase: null })
      .mockResolvedValueOnce({ purchase: result.purchase })
    const { flow } = fixture({ offers: vi.fn().mockRejectedValue(new Error('Offline')), restore })
    await flow.load()
    const catalogError = flow.catalogError.value
    expect(catalogError).toBeTruthy()
    await flow.restore()
    expect(flow.catalogError.value).toBe(catalogError)
    expect(flow.notice.value).toContain('пока нет активных покупок')
    await flow.restore()
    expect(flow.receipt.value).toEqual(result.purchase)
    expect(flow.restored.value).toBe(true)
  })

  it('explains blocked bootstrap storage and rate limits without losing the retry key', async () => {
    const { flow } = fixture({
      offers: vi.fn().mockRejectedValue(new PaywallApiError('BOOTSTRAP_REQUIRED')),
    })
    await flow.load()
    expect(flow.catalogError.value).toContain('cookies и локальное хранилище')

    const purchase = vi
      .fn()
      .mockRejectedValueOnce(new PaywallApiError('RATE_LIMITED'))
      .mockResolvedValueOnce(result)
    const limited = fixture({ purchase })
    await limited.flow.load()
    await limited.flow.purchase()
    expect(limited.flow.error.value?.message).toContain('Слишком много запросов')
    await limited.flow.purchase()
    expect(purchase.mock.calls[1]![0].requestId).toBe(firstRequestId)
  })
})
