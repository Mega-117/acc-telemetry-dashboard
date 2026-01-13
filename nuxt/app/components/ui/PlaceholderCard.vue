<script setup lang="ts">
// ============================================
// PlaceholderCard - Reusable card placeholder
// ============================================

defineProps<{
  title: string
}>()
</script>

<template>
  <div class="placeholder-card">
    <h3 class="card-title">{{ title }}</h3>
    <p class="card-content">Placeholder contenuto</p>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.placeholder-card {
  padding: 24px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  min-height: 160px;
}

.card-title {
  font-family: $font-primary;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 16px;
}

.card-content {
  font-family: $font-primary;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
