<script setup lang="ts">
// ============================================
// SplashLogo - Logo ACC Telemetry
// ============================================
</script>

<template>
  <div class="splash-logo">
    <span class="splash-logo__mark">ACC</span>
    <span class="splash-logo__text">TELEMETRY</span>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;

.splash-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $spacing-sm;
  margin-bottom: $spacing-xl;
  
  &__mark {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: $font-weight-bold;
    letter-spacing: 2px;
    background: var(--gradient-primary);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 0 0 30px rgba(var(--theme-accent-rgb), 0.5);
  }
  
  &__text {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: $font-weight-bold;
    letter-spacing: 4px;
    color: var(--text-primary);
  }
}
</style>
