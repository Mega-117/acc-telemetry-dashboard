<script setup lang="ts">
defineProps<{ comparisonOpen: boolean; label: string }>()

</script>

<template>
  <div class="session-analysis">
    <header class="analysis-toolbar">
      <h2>{{ comparisonOpen ? 'Confronto stint' : label }}</h2>
    </header>
    <slot />
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as racing;
.analysis-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
h2 { @include racing.section-title; }
button { @include racing.action; min-height: 34px; padding: 8px 14px; flex-shrink: 0; }
</style>
