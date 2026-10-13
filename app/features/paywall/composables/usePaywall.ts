import { computed, ref } from 'vue'
import type { Offer, PurchaseReceipt } from '#shared/contracts/paywall'
import type { PaywallApi } from '../api/paywall-api'
import { PaywallApiError } from '../api/api-error'
import { createPurchaseAttempts } from '../api/purchase-attempts'

type Operation = 'loading' | 'idle' | 'purchasing' | 'restoring'
type ErrorScope = 'purchase' | 'restore'

/** One operation at a time; an uncertain purchase keeps its idempotency key for retry. */
export function usePaywall(
  api: PaywallApi,
  createId: () => string = () => crypto.randomUUID(),
  attempts = createPurchaseAttempts(),
) {
  const offers = ref<Offer[]>([])
  const selectedId = ref<Offer['id']>('yearly')
  const operation = ref<Operation>('loading')
  const receipt = ref<PurchaseReceipt | null>(null)
  const restored = ref(false)
  const catalogError = ref<string | null>(null)
  const error = ref<{ scope: ErrorScope; message: string; code?: 'SESSION_REQUIRED' } | null>(null)
  const notice = ref('')
  const selected = computed(() => offers.value.find((offer) => offer.id === selectedId.value))
  const busy = computed(() => operation.value !== 'idle')
  let pending: AbortController | null = null
  let disposed = false

  function begin(next: Operation) {
    operation.value = next
    error.value = null
    notice.value = ''
    const controller = new AbortController()
    pending = controller
    return controller
  }

  function finish(controller: AbortController) {
    if (!disposed && pending === controller) {
      operation.value = 'idle'
      pending = null
    }
  }

  function failure(scope: ErrorScope, cause: unknown, message: string) {
    if (disposed) return
    error.value =
      cause instanceof PaywallApiError && cause.code === 'SESSION_REQUIRED'
        ? {
            scope,
            code: 'SESSION_REQUIRED',
            message:
              'Разрешите cookies для этого сайта, затем нажмите «Обновить доступ». Они нужны, чтобы сохранить покупку на вашем устройстве.',
          }
        : {
            scope,
            message:
              cause instanceof PaywallApiError && cause.code === 'RATE_LIMITED'
                ? 'Слишком много запросов. Немного подождите и попробуйте ещё раз.'
                : message,
          }
  }

  async function load() {
    if (disposed || pending || receipt.value) return
    const controller = begin('loading')
    catalogError.value = null
    try {
      const response = await api.offers(controller.signal)
      if (disposed) return
      if (!response.offers.length) throw new Error('Empty catalog')
      const previousSelection = offers.value.length ? selectedId.value : undefined
      offers.value = response.offers
      selectedId.value = (
        response.offers.find((offer) => offer.id === previousSelection) ??
        response.offers.find((offer) => offer.recommended) ??
        response.offers[0]!
      ).id
    } catch (cause) {
      if (!disposed)
        catalogError.value =
          cause instanceof PaywallApiError && cause.code === 'BOOTSTRAP_REQUIRED'
            ? 'Разрешите cookies и локальное хранилище для этого сайта, затем попробуйте ещё раз. Они нужны, чтобы сохранить доступ на вашем устройстве.'
            : cause instanceof PaywallApiError && cause.code === 'RATE_LIMITED'
              ? 'Слишком много запросов. Немного подождите и попробуйте ещё раз.'
              : 'Не удалось загрузить тарифы. Проверьте интернет и попробуйте ещё раз.'
    } finally {
      finish(controller)
    }
  }

  function select(id: Offer['id']) {
    if (busy.value || receipt.value || !offers.value.some((offer) => offer.id === id)) return
    selectedId.value = id
    error.value = null
    notice.value = ''
  }

  async function purchase() {
    if (disposed || busy.value || !selected.value || receipt.value) return
    const controller = begin('purchasing')
    try {
      const offerId = selected.value.id
      if (!attempts.get(offerId)) attempts.set(offerId, createId())
      const response = await api.purchase(
        { offerId, requestId: attempts.get(offerId)! },
        controller.signal,
      )
      if (disposed) return
      attempts.confirm(response.purchase.offerId, response.purchase.requestId)
      if (!response.active) {
        notice.value =
          'Срок этой покупки уже истёк. Нажмите «Открыть весь мир», чтобы оформить новый доступ.'
        return
      }
      receipt.value = response.purchase
      restored.value = false
    } catch (cause) {
      failure(
        'purchase',
        cause,
        'Не получилось подтвердить покупку. Попробуйте ещё раз — повтор не создаст вторую покупку.',
      )
    } finally {
      finish(controller)
    }
  }

  async function restore() {
    if (disposed || busy.value || receipt.value) return
    const controller = begin('restoring')
    try {
      const response = await api.restore(controller.signal)
      if (disposed) return
      if (response.purchase) {
        attempts.confirm(response.purchase.offerId, response.purchase.requestId)
        receipt.value = response.purchase
        restored.value = true
      } else
        notice.value = 'На этом устройстве пока нет активных покупок. Выберите тариф, чтобы начать.'
    } catch (cause) {
      failure(
        'restore',
        cause,
        'Не удалось восстановить покупку. Проверьте интернет и попробуйте ещё раз.',
      )
    } finally {
      finish(controller)
    }
  }

  function dispose() {
    disposed = true
    pending?.abort()
  }

  return {
    offers,
    selectedId,
    selected,
    operation,
    receipt,
    restored,
    catalogError,
    error,
    notice,
    busy,
    load,
    select,
    purchase,
    restore,
    dispose,
  }
}
