import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPaywallApi } from '../../app/features/paywall/api/paywall-api'
import { PaywallApiError } from '../../app/features/paywall/api/api-error'
import { createDeviceBootstrap } from '../../app/features/paywall/api/device-bootstrap'

afterEach(() => vi.useRealTimers())

describe('paywall HTTP transport cancellation', () => {
  it('times out a stalled request even when the caller supplies a lifecycle signal', async () => {
    vi.useFakeTimers()
    let receivedSignal: AbortSignal | undefined
    const api = createPaywallApi(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          receivedSignal = options.signal
          options.signal.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          })
        }),
      100,
    )
    const request = api.offers(new AbortController().signal)
    const expectation = expect(request).rejects.toEqual(new PaywallApiError('UNAVAILABLE'))
    await vi.advanceTimersByTimeAsync(101)
    await expectation
    expect(receivedSignal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels on view disposal and cleans up its deadline', async () => {
    vi.useFakeTimers()
    const lifecycle = new AbortController()
    const api = createPaywallApi(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          })
        }),
    )
    const request = api.restore(lifecycle.signal)
    const expectation = expect(request).rejects.toBeInstanceOf(PaywallApiError)
    lifecycle.abort()
    await expectation
    expect(vi.getTimerCount()).toBe(0)
  })

  it('exposes a known session code without leaking raw provider error messages', async () => {
    const api = createPaywallApi(() =>
      Promise.reject({
        data: { data: { code: 'SESSION_REQUIRED', message: 'Unsafe provider details' } },
      }),
    )
    await expect(
      api.purchase({ offerId: 'yearly', requestId: 'test' }, new AbortController().signal),
    ).rejects.toEqual(new PaywallApiError('SESSION_REQUIRED'))
  })

  it('sends the persistent bootstrap capability only for the catalog request', async () => {
    const transport = vi.fn().mockResolvedValue({})
    const deviceId = '11111111-2222-4333-8444-555555555555'
    const bootstrap = vi.fn().mockResolvedValue(deviceId)
    const api = createPaywallApi(transport, 100, bootstrap)
    await api.offers(new AbortController().signal)
    await api.restore(new AbortController().signal)

    expect(bootstrap).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]![1]).toMatchObject({
      headers: { 'X-Lumi-Bootstrap': deviceId },
      retry: 0,
    })
    expect(transport.mock.calls[1]![1].headers).toBeUndefined()
  })

  it('allows an existing cookie session when bootstrap storage is unavailable', async () => {
    const transport = vi.fn().mockResolvedValue({ offers: [] })
    const api = createPaywallApi(transport, 100, async () => null)
    await api.offers(new AbortController().signal)
    expect(transport.mock.calls[0]![1].headers).toBeUndefined()
  })

  it('includes a stalled storage bootstrap in the deadline and never dispatches after abort', async () => {
    vi.useFakeTimers()
    const opening = {} as IDBOpenDBRequest
    const factory = { open: vi.fn().mockReturnValue(opening) } as unknown as IDBFactory
    const transport = vi.fn()
    const api = createPaywallApi(transport, 100, createDeviceBootstrap(factory))
    const request = api.offers(new AbortController().signal)
    const expectation = expect(request).rejects.toEqual(new PaywallApiError('UNAVAILABLE'))
    await vi.advanceTimersByTimeAsync(101)
    await expectation
    expect(transport).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['BOOTSTRAP_REQUIRED', 'RATE_LIMITED'] as const)(
    'preserves the recognized %s code for actionable UI feedback',
    async (code) => {
      const api = createPaywallApi(() => Promise.reject({ data: { data: { code } } }))
      await expect(api.offers(new AbortController().signal)).rejects.toEqual(
        new PaywallApiError(code),
      )
    },
  )
})
