<script setup lang="ts">
// ============================================
// AuthTabs - Toggle LOGIN / REGISTRATI
// ============================================

interface Props {
  activeTab: 'login' | 'register'
}

defineProps<Props>()

const emit = defineEmits<{
  'update:activeTab': [tab: 'login' | 'register']
}>()
</script>

<template>
  <div class="auth-tabs">
    <button 
      class="auth-tabs__tab"
      :class="{ 'auth-tabs__tab--active': activeTab === 'login' }"
      @click="emit('update:activeTab', 'login')"
    >
      LOGIN
    </button>
    <button 
      class="auth-tabs__tab"
      :class="{ 'auth-tabs__tab--active': activeTab === 'register' }"
      @click="emit('update:activeTab', 'register')"
    >
      REGISTRATI
    </button>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;

.auth-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: $spacing-lg;
  
  &__tab {
    flex: 1;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-md;
    color: var(--text-secondary);
    font-weight: $font-weight-semibold;
    font-size: $font-size-sm;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: all 0.3s var(--ease-smooth);
    
    &:hover:not(&--active) {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
    }
    
    &--active {
      background: var(--gradient-primary);
      border-color: var(--theme-accent);
      color: white;
      box-shadow: 0 4px 16px rgba(var(--theme-accent-rgb), 0.3);
    }
  }
}
</style>
