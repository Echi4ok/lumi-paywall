import type {
  OffersResponse,
  PurchaseRequest,
  PurchaseResponse,
  RestoreResponse,
} from '#shared/contracts/paywall'
import { PaywallApiError } from './api-error'

/** Transport is deliberately separate from the purchase flow and presentational components. */
export interface PaywallApi {
  offers(signal: AbortSignal): Promise<OffersResponse>
  purchase(input: PurchaseRequest, signal: AbortSignal): Promise<PurchaseResponse>
  restore(signal: AbortSignal): Promise<RestoreResponse>
}

type RequestOptions = { signal: AbortSignal; method?: 'POST'; body?: PurchaseRequest; retry: 0 }
type Transport = (path: string, options: RequestOptions) => Promise<unknown>

export function createPaywallApi(transport: Transport, timeoutMs = 12_000): PaywallApi {
  async function request<T>(
    path: string,
    signal: AbortSignal,
    body?: PurchaseRequest,
    method?: 'POST',
  ): Promise<T> {
    // ofetch ignores `timeout` when a signal is supplied, so compose both cancellation sources here.
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const timer = setTimeout(abort, timeoutMs)
    try {
      return (await transport(path, { signal: controller.signal, method, body, retry: 0 })) as T
    } catch (error) {
      const response = error as { data?: { data?: { code?: string } } }
      throw new PaywallApiError(
        response?.data?.data?.code === 'SESSION_REQUIRED' ? 'SESSION_REQUIRED' : 'UNAVAILABLE',
      )
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
  }
  return {
    offers: (signal) => request('/api/offers', signal),
    purchase: (body, signal) => request('/api/purchase', signal, body, 'POST'),
    restore: (signal) => request('/api/restore', signal, undefined, 'POST'),
  }
}

export const paywallApi = createPaywallApi((path, options) => $fetch(path, options))
