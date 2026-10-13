// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Offer, PurchaseReceipt, PurchaseResponse } from '#shared/contracts/paywall'
import PaywallPage from '../../app/features/paywall/components/PaywallPage.vue'
import OfferCard from '../../app/features/paywall/components/OfferCard.vue'
import PurchaseSuccess from '../../app/features/paywall/components/PurchaseSuccess.vue'
import { PaywallApiError } from '../../app/features/paywall/api/api-error'

const api = vi.hoisted(() => ({ offers: vi.fn(), purchase: vi.fn(), restore: vi.fn() }))
vi.mock('../../app/features/paywall/api/paywall-api', () => ({ paywallApi: api }))

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
const receipt: PurchaseReceipt = {
  id: 'receipt-1',
  requestId: '11111111-2222-4333-8444-555555555555',
  offerId: 'yearly',
  purchasedAt: '2026-10-13T12:00:00.000Z',
  expiresAt: '2027-10-13T12:00:00.000Z',
}
const purchased: PurchaseResponse = { purchase: receipt, active: true, replayed: false }
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  window.sessionStorage.clear()
  api.offers.mockResolvedValue({ offers })
  api.purchase.mockImplementation(async (input) => ({
    ...purchased,
    purchase: { ...receipt, ...input },
  }))
  api.restore.mockResolvedValue({ purchase: null })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

async function page() {
  wrapper = mount(PaywallPage, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('paywall rendered behavior', () => {
  it('uses native radios, changes the selected tariff, and submits its price disclosure', async () => {
    const view = await page()
    expect(view.get<HTMLInputElement>('input[value="yearly"]').element.checked).toBe(true)
    const monthly = view.get<HTMLInputElement>('input[value="monthly"]')
    monthly.element.focus()
    expect(document.activeElement).toBe(monthly.element)
    await monthly.setValue()
    expect(monthly.element.checked).toBe(true)
    expect(view.get<HTMLInputElement>('input[value="yearly"]').element.checked).toBe(false)
    expect(view.get('.purchase-disclosure').text()).toContain('299 ₽ за 30 дней')
    await view.get('.purchase-button').trigger('click')
    await flushPromises()
    expect(api.purchase.mock.calls[0]![0].offerId).toBe('monthly')
  })

  it('renders loading then unlocks the same interactive controls', async () => {
    let complete!: (value: { offers: Offer[] }) => void
    api.offers.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    wrapper = mount(PaywallPage, { attachTo: document.body })
    expect(wrapper.get('.offers-loading').attributes('role')).toBe('status')
    expect(wrapper.get<HTMLButtonElement>('.purchase-button').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('.restore-button').element.disabled).toBe(true)
    complete({ offers })
    await flushPromises()
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
    expect(wrapper.get<HTMLButtonElement>('.purchase-button').element.disabled).toBe(false)
  })

  it('blocks all competing interactions until purchase completion then focuses success', async () => {
    let complete!: (value: PurchaseResponse) => void
    api.purchase.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const view = await page()
    await view.get('.purchase-button').trigger('click')
    expect(view.get('.purchase-button').attributes('aria-busy')).toBe('true')
    expect(view.get<HTMLButtonElement>('.purchase-button').element.disabled).toBe(true)
    expect(view.get<HTMLButtonElement>('.restore-button').element.disabled).toBe(true)
    expect(
      view
        .findAll<HTMLInputElement>('input[type="radio"]')
        .every((input) => input.element.disabled),
    ).toBe(true)
    view.get<HTMLButtonElement>('.purchase-button').element.click()
    expect(api.purchase).toHaveBeenCalledTimes(1)
    complete(purchased)
    await flushPromises()
    expect(view.get('#success-heading').text()).toContain('Весь мир Луми')
    expect(document.activeElement).toBe(view.get('#success-heading').element)
  })

  it('offers recovery for an empty catalog and still permits restoring purchases', async () => {
    api.offers.mockResolvedValue({ offers: [] })
    const view = await page()
    expect(view.get('[role="alert"]').text()).toContain('Тарифы немного задержались')
    expect(view.find('.purchase-button').exists()).toBe(false)
    expect(view.get<HTMLButtonElement>('.restore-button').element.disabled).toBe(false)
    await view.get('.restore-button').trigger('click')
    await flushPromises()
    expect(api.restore).toHaveBeenCalledTimes(1)
    expect(view.text()).toContain('пока нет активных покупок')
    expect(view.text()).toContain('Тарифы немного задержались')
    api.offers.mockResolvedValue({ offers })
    await view.get('.ui-message__actions button').trigger('click')
    await flushPromises()
    expect(view.findAll('input[type="radio"]')).toHaveLength(2)
  })

  it('recovers access while catalog loading fails, without requiring an offer response', async () => {
    api.offers.mockRejectedValue(new Error('Catalog offline'))
    api.restore.mockResolvedValue({ purchase: receipt })
    const view = await page()
    await view.get('.restore-button').trigger('click')
    await flushPromises()
    expect(view.get('.success-badge').text()).toBe('Покупка восстановлена')
    expect(view.get('.receipt-card').text()).toContain('Все приключения')
    expect(document.activeElement).toBe(view.get('#success-heading').element)
  })

  it('disables catalog retry while restore is pending and enables it after completion', async () => {
    let complete!: (value: { purchase: null }) => void
    api.offers.mockRejectedValue(new Error('Catalog offline'))
    api.restore.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const view = await page()
    const retry = view.get<HTMLButtonElement>('.ui-message__actions button')
    expect(retry.element.disabled).toBe(false)
    await view.get('.restore-button').trigger('click')
    expect(retry.element.disabled).toBe(true)
    retry.element.click()
    expect(api.offers).toHaveBeenCalledTimes(1)
    complete({ purchase: null })
    await flushPromises()
    expect(retry.element.disabled).toBe(false)
    await retry.trigger('click')
    await flushPromises()
    expect(api.offers).toHaveBeenCalledTimes(2)
  })

  it('announces a purchase failure and offers an explicit retry with the same request key', async () => {
    api.purchase
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(purchased)
    const view = await page()
    await view.get('.purchase-button').trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Не получилось подтвердить покупку')
    expect(view.get('.purchase-button').text()).toBe('Попробовать ещё раз')
    await view.get('.purchase-button').trigger('click')
    await flushPromises()
    expect(api.purchase.mock.calls[1]![0].requestId).toBe(api.purchase.mock.calls[0]![0].requestId)
    expect(view.find('#success-heading').exists()).toBe(true)
  })

  it('shows an expired replay as status and waits for another explicit purchase', async () => {
    api.purchase.mockResolvedValue({ ...purchased, active: false, replayed: true })
    const view = await page()
    await view.get('.purchase-button').trigger('click')
    await flushPromises()
    expect(view.find('#success-heading').exists()).toBe(false)
    expect(view.get('.ui-message[role="status"]').text()).toContain('Срок этой покупки уже истёк')
    expect(view.get('.purchase-button').text()).toBe('Открыть весь мир')
    expect(api.purchase).toHaveBeenCalledTimes(1)
  })

  it('keeps restore errors distinct from no prior purchase', async () => {
    api.restore.mockRejectedValue(new Error('Offline'))
    const view = await page()
    await view.get('.restore-button').trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Не удалось восстановить покупку')
    expect(view.text()).not.toContain('пока нет активных покупок')
    expect(view.get<HTMLButtonElement>('.restore-button').element.disabled).toBe(false)
  })

  it('refreshes a missing session without replacing the selected monthly tariff', async () => {
    api.purchase.mockRejectedValue(new PaywallApiError('SESSION_REQUIRED'))
    const view = await page()
    await view.get('input[value="monthly"]').setValue()
    await view.get('.purchase-button').trigger('click')
    await flushPromises()
    expect(view.get('.purchase-button').text()).toBe('Обновить доступ')
    await view.get('.purchase-button').trigger('click')
    await flushPromises()
    expect(api.offers).toHaveBeenCalledTimes(2)
    expect(view.get<HTMLInputElement>('input[value="monthly"]').element.checked).toBe(true)
  })
})

describe('standalone feature components', () => {
  it('emits a radio change without owning selection state', async () => {
    wrapper = mount(OfferCard, {
      props: { offer: offers[0]!, selected: false, disabled: false, savings: null },
    })
    await wrapper.get('input').setValue()
    expect(wrapper.emitted('select')).toEqual([['monthly']])
    await wrapper.setProps({ selected: true })
    expect(wrapper.classes()).toContain('is-selected')
  })

  it('opens and closes receipt details through an accessible disclosure', async () => {
    wrapper = mount(PurchaseSuccess, {
      props: { receipt, restored: false, offers },
      attachTo: document.body,
    })
    const toggle = wrapper.get('.receipt-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#receipt-details').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#receipt-details').text()).toContain(receipt.id)
    await toggle.trigger('click')
    expect(wrapper.find('#receipt-details').exists()).toBe(false)
  })
})
