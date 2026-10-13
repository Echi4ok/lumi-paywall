import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPaywallApi } from '../../app/features/paywall/api/paywall-api'
import { PaywallApiError } from '../../app/features/paywall/api/api-error'

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
})
