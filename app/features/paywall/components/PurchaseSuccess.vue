<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import type { PurchaseReceipt, Offer } from '#shared/contracts/paywall'
import LumiIllustration from './LumiIllustration.vue'
import UiButton from '../../../ui/UiButton.vue'

const props = defineProps<{ receipt: PurchaseReceipt; restored: boolean; offers: Offer[] }>()
const heading = useTemplateRef<HTMLHeadingElement>('heading')
const detailsOpen = ref(false)
const offer = computed(() => props.offers.find((item) => item.id === props.receipt.offerId))
const date = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(new Date(props.receipt.expiresAt)),
)
onMounted(() => heading.value?.focus())
</script>

<template>
  <section class="success-panel" aria-labelledby="success-heading">
    <LumiIllustration />
    <div class="success-badge">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          d="m4 9 3 3 7-7"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {{ restored ? 'Покупка восстановлена' : 'Покупка подтверждена' }}
    </div>
    <h1 id="success-heading" ref="heading" tabindex="-1">
      Весь мир Луми
      <br />
      теперь открыт!
    </h1>
    <p class="success-description">
      Спасибо, что исследуете мир вместе.
      <br />
      Впереди столько маленьких открытий.
    </p>
    <div class="receipt-card">
      <div>
        <span class="receipt-label">Ваш доступ</span>
        <strong>{{ offer?.title ?? 'Все приключения' }}</strong>
      </div>
      <span class="receipt-divider" />
      <div>
        <span class="receipt-label">Открыт до</span>
        <strong>{{ date }}</strong>
      </div>
    </div>
    <p class="success-note">
      Это тестовая покупка. Деньги не списаны.
      <br />
      Доступ восстановится в этом браузере.
    </p>
    <UiButton
      variant="ghost"
      class="receipt-toggle"
      :aria-expanded="detailsOpen"
      aria-controls="receipt-details"
      @click="detailsOpen = !detailsOpen"
    >
      {{ detailsOpen ? 'Скрыть детали покупки' : 'Посмотреть детали покупки' }}
      <span aria-hidden="true">{{ detailsOpen ? '−' : '+' }}</span>
    </UiButton>
    <dl v-if="detailsOpen" id="receipt-details" class="receipt-details">
      <dt>Номер покупки</dt>
      <dd>{{ receipt.id }}</dd>
      <dt>Дата покупки</dt>
      <dd>
        {{
          new Intl.DateTimeFormat('ru-RU', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'Europe/Moscow',
          }).format(new Date(receipt.purchasedAt))
        }}
        (МСК)
      </dd>
      <dt>Продление</dt>
      <dd>Автоматического продления нет</dd>
    </dl>
  </section>
</template>

<style src="./PurchaseSuccess.css" scoped />
