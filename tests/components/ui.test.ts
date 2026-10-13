// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import UiButton from '../../app/ui/UiButton.vue'
import UiMessage from '../../app/ui/UiMessage.vue'

describe('UI primitives', () => {
  it('keeps a real focusable button and forwards enabled clicks', () => {
    const click = vi.fn()
    const wrapper = mount(UiButton, {
      attachTo: document.body,
      attrs: { onClick: click },
      slots: { default: 'Открыть' },
    })
    const button = wrapper.get('button').element
    button.focus()
    expect(document.activeElement).toBe(button)
    button.click()
    expect(click).toHaveBeenCalledTimes(1)
    expect(button.type).toBe('button')
    wrapper.unmount()
  })

  it('blocks activation and hides the decorative trailing icon while loading', async () => {
    const click = vi.fn()
    const wrapper = mount(UiButton, {
      props: { loading: true },
      attrs: { onClick: click },
      slots: { default: 'Открываем…', trailing: '<span data-icon>↗</span>' },
    })
    expect(wrapper.get('button').element.disabled).toBe(true)
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('.ui-spinner').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('[data-icon]').exists()).toBe(false)
    wrapper.get('button').element.click()
    expect(click).not.toHaveBeenCalled()
    await wrapper.setProps({ loading: false, disabled: true })
    wrapper.get('button').element.click()
    expect(click).not.toHaveBeenCalled()
    expect(wrapper.find('[data-icon]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('announces errors assertively and ordinary status politely', async () => {
    const wrapper = mount(UiMessage, {
      props: { tone: 'error', title: 'Тарифы недоступны' },
      slots: { default: 'Проверьте интернет', actions: '<button>Повторить</button>' },
    })
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.get('h2').text()).toBe('Тарифы недоступны')
    expect(wrapper.get('button').text()).toBe('Повторить')
    await wrapper.setProps({ tone: 'info', title: undefined })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.find('h2').exists()).toBe(false)
    wrapper.unmount()
  })
})
