<script setup lang="ts">
import { computed, onMounted, onScopeDispose } from 'vue'
import LumiIllustration from './LumiIllustration.vue'
import OfferCard from './OfferCard.vue'
import PurchaseSuccess from './PurchaseSuccess.vue'
import { paywallApi } from '../api/paywall-api'
import { usePaywall } from '../composables/usePaywall'
import UiButton from '../../../ui/UiButton.vue'
import UiMessage from '../../../ui/UiMessage.vue'

const {
  offers,
  selected,
  selectedId,
  operation,
  receipt,
  restored,
  error,
  catalogError,
  notice,
  busy,
  load,
  select,
  purchase,
  restore,
  dispose,
} = usePaywall(paywallApi)
const savings = computed(() => {
  const yearly = offers.value.find((offer) => offer.id === 'yearly')
  const monthly = offers.value.find((offer) => offer.id === 'monthly')
  return yearly && monthly
    ? Math.round((1 - yearly.priceMinor / (monthly.priceMinor * 12)) * 100)
    : null
})
const orderedOffers = computed(() =>
  [...offers.value].sort((a, b) => Number(b.recommended) - Number(a.recommended)),
)
const formattedPrice = computed(() =>
  selected.value
    ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
        selected.value.priceMinor / 100,
      )
    : '',
)
// Client-side loading lets the initial offers response establish the HttpOnly device cookie.
onMounted(load)
onScopeDispose(dispose)
</script>

<template>
  <main class="paywall-shell">
    <header class="brand-header">
      <span class="brand" aria-label="Луми">луми</span>
      <span class="parent-label">ДЛЯ РОДИТЕЛЕЙ</span>
    </header>
    <PurchaseSuccess v-if="receipt" :receipt="receipt" :restored="restored" :offers="offers" />
    <template v-else>
      <section class="paywall-intro" aria-labelledby="paywall-title">
        <LumiIllustration />
        <h1 id="paywall-title">
          Большой мир
          <br />
          маленьких открытий
        </h1>
        <p class="intro-description">
          Играйте, исследуйте и учитесь вместе.
          <br />
          Все приключения — в одном доступе.
        </p>
        <ul class="benefits" aria-label="Преимущества">
          <li>
            <span aria-hidden="true">✦</span>
            Без рекламы
          </li>
          <li>
            <span aria-hidden="true">♡</span>
            В своём темпе
          </li>
        </ul>
      </section>
      <section class="purchase-section" aria-label="Оформление тестового доступа" :aria-busy="busy">
        <div v-if="operation === 'loading'" class="offers-loading" role="status">
          <div class="skeleton-card" />
          <div class="skeleton-card" />
          <span class="sr-only">Загружаем тарифы…</span>
        </div>
        <UiMessage v-else-if="catalogError" tone="error" title="Тарифы немного задержались">
          {{ catalogError }}
          <template #actions>
            <UiButton variant="secondary" :disabled="busy" @click="load">
              Попробовать ещё раз
            </UiButton>
          </template>
        </UiMessage>
        <fieldset v-else class="offers" :disabled="busy">
          <legend class="sr-only">Выберите тариф</legend>
          <OfferCard
            v-for="offer in orderedOffers"
            :key="offer.id"
            :offer="offer"
            :selected="selectedId === offer.id"
            :disabled="busy"
            :savings="savings"
            @select="select"
          />
        </fieldset>
        <UiMessage v-if="error" class="purchase-message" tone="error">
          {{ error.message }}
        </UiMessage>
        <UiMessage v-if="notice" class="purchase-message">{{ notice }}</UiMessage>
        <template v-if="!catalogError">
          <UiButton
            class="purchase-button"
            :disabled="busy || !selected"
            :loading="operation === 'purchasing'"
            @click="error?.code === 'SESSION_REQUIRED' ? load() : purchase()"
          >
            <span>
              {{
                operation === 'purchasing'
                  ? 'Открываем мир…'
                  : error?.code === 'SESSION_REQUIRED'
                    ? 'Обновить доступ'
                    : error?.scope === 'purchase'
                      ? 'Попробовать ещё раз'
                      : 'Открыть весь мир'
              }}
            </span>
            <template #trailing>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 18 18 6M6 6h12v12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </template>
          </UiButton>
          <p class="purchase-disclosure">
            <template v-if="selected">
              Тестовая покупка · {{ formattedPrice }} ₽ за {{ selected.durationDays }} дней
              <br />
            </template>
            <template v-else>
              Тестовый доступ к приключениям
              <br />
            </template>
            Деньги не спишутся. Автопродления нет.
          </p>
        </template>
        <UiButton
          variant="ghost"
          class="restore-button"
          :disabled="busy"
          :loading="operation === 'restoring'"
          @click="restore"
        >
          {{ operation === 'restoring' ? 'Ищем вашу покупку…' : 'Восстановить покупки' }}
        </UiButton>
        <span class="sr-only" role="status">
          {{
            operation === 'purchasing'
              ? 'Подтверждаем тестовую покупку'
              : operation === 'restoring'
                ? 'Ищем активную покупку на этом устройстве'
                : ''
          }}
        </span>
      </section>
    </template>
    <footer class="app-footer">Учебный проект. Маленькая игра, большие мечты.</footer>
  </main>
</template>

<style src="./PaywallPage.css" scoped />
