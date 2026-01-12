<script setup lang="ts">
// ============================================
// LoadingSpinner - Spinner di caricamento
// ============================================

interface Props {
  size?: 'sm' | 'md' | 'lg'
}

withDefaults(defineProps<Props>(), {
  size: 'md'
})
</script>

<template>
  <div :class="['spinner', `spinner--${size}`]"></div>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;

.spinner {
  border-radius: 50%;
  border: 4px solid rgba(var(--theme-accent-rgb), 0.2);
  border-top-color: var(--theme-accent);
  animation: spin 1s linear infinite;
  
  // === SIZES ===
  &--sm {
    width: 24px;
    height: 24px;
    border-width: 3px;
  }
  
  &--md {
    width: 40px;
    height: 40px;
    border-width: 4px;
  }
  
  &--lg {
    width: 56px;
    height: 56px;
    border-width: 5px;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
