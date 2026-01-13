<script setup lang="ts">
// ============================================
// PageContainer - Centered 1400px container
// ============================================
</script>

<template>
  <div class="page-container">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.page-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px;
}
</style>
