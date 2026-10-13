<script setup lang="ts">
import { computed } from 'vue'
import type { Offer } from '#shared/contracts/paywall'

const props = defineProps<{
  offer: Offer
  selected: boolean
  disabled: boolean
  savings: number | null
}>()
defineEmits<{ select: [id: Offer['id']] }>()
const price = computed(() =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(props.offer.priceMinor / 100),
)
const monthly = computed(() => Math.round(props.offer.priceMinor / 100 / 12))
</script>

<template>
  <label
    class="offer-card"
    :class="{
      'is-selected': selected,
      'is-yearly': offer.id === 'yearly',
      'is-disabled': disabled,
    }"
  >
    <input
      type="radio"
      name="offer"
      :value="offer.id"
      :checked="selected"
      :disabled="disabled"
      @change="$emit('select', offer.id)"
    />
    <span class="offer-radio" aria-hidden="true">
      <svg v-if="selected" viewBox="0 0 16 16" width="14" height="14">
        <path
          d="m4 8 2.5 2.5L12 5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span class="offer-copy">
      <span class="offer-top">
        <span class="offer-name">{{ offer.title }}</span>
        <span class="offer-price">{{ price }} ₽</span>
      </span>
      <span class="offer-bottom">
        <span class="offer-caption">
          {{
            offer.id === 'yearly' ? `≈ ${monthly} ₽ в месяц` : `${offer.durationDays} дней открытий`
          }}
        </span>
        <span
          v-if="offer.id === 'yearly' && savings"
          class="savings"
          :aria-label="`На ${savings}% выгоднее 12 месячных покупок`"
        >
          −{{ savings }}%
        </span>
      </span>
      <span class="sr-only">
        Полная стоимость {{ price }} рублей за {{ offer.durationDays }} дней. Тестовая покупка.
      </span>
    </span>
  </label>
</template>

<style src="./OfferCard.css" scoped />
