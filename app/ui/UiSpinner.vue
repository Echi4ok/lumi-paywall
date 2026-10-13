<template><span class="ui-spinner" aria-hidden="true" /></template>

<style scoped>
.ui-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  display: inline-block;
  flex: none;
  animation: ui-spin 0.8s linear infinite;
}
@keyframes ui-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
