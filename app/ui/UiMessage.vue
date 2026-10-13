<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'info' | 'error'
    title?: string
  }>(),
  { tone: 'info', title: undefined },
)
</script>

<template>
  <div
    class="ui-message"
    :class="{ 'ui-message--error': tone === 'error', 'ui-message--panel': title }"
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    <span v-if="tone === 'error'" class="ui-message__icon" aria-hidden="true">!</span>
    <div class="ui-message__body">
      <h2 v-if="title" class="ui-message__title">{{ title }}</h2>
      <p><slot /></p>
      <div v-if="$slots.actions" class="ui-message__actions"><slot name="actions" /></div>
    </div>
  </div>
</template>

<style src="./UiMessage.css" scoped />
