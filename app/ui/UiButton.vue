<script setup lang="ts">
import UiSpinner from './UiSpinner.vue'

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'primary', disabled: false, loading: false },
)
</script>

<template>
  <button
    type="button"
    class="ui-button"
    :class="`ui-button--${variant}`"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <UiSpinner v-if="loading" />
    <slot />
    <slot v-if="!loading" name="trailing" />
  </button>
</template>

<style src="./UiButton.css" scoped />
