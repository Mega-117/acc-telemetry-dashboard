<script setup lang="ts">
// ============================================
// TabsBarRouter - Navigation tabs with NuxtLink
// ============================================

defineProps<{
  activeTab: 'panoramica' | 'sessioni' | 'piste'
}>()

const tabs = [
  { id: 'panoramica', label: 'PANORAMICA', to: '/panoramica' },
  { id: 'sessioni', label: 'SESSIONI', to: '/sessioni' },
  { id: 'piste', label: 'PISTE', to: '/piste' }
]
</script>

<template>
  <nav class="tabsbar">
    <div class="tabsbar__inner">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        class="tab"
        :class="{ 'tab--active': activeTab === tab.id }"
      >
        {{ tab.label }}
      </NuxtLink>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.tabsbar {
  background: rgba(255, 255, 255, 0.01);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tabsbar__inner {
  display: flex;
  gap: 8px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
}

.tab {
  position: relative;
  padding: 16px 24px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s ease;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  &--active {
    color: #fff;

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, $racing-red, $racing-orange);
    }
  }
}
</style>
