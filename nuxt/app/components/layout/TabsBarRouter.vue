<script setup lang="ts">
// ============================================
// TabsBarRouter - Navigation tabs with NuxtLink
// Auto-detects active tab from current route
// ============================================

defineProps<{
  activeTab?: 'panoramica' | 'sessioni' | 'piste' | 'spotter' | 'area-pilota' | 'test-hud'
}>()

const route = useRoute()

// PIP-187: Test HUD e' temporaneamente pubblica per QA overlay develop/prod.

const baseTabs = [
  { id: 'panoramica', label: 'PANORAMICA', to: '/panoramica' },
  { id: 'sessioni', label: 'SESSIONI', to: '/sessioni' },
  { id: 'piste', label: 'PISTE', to: '/piste' },
  { id: 'spotter', label: 'SPOTTER', to: '/spotter' },
  { id: 'area-pilota', label: 'AREA PILOTA', to: '/area-pilota' }
]

const tabs = computed(() => [...baseTabs, { id: 'test-hud', label: 'TEST HUD', to: '/test-hud' }])

// Check if tab is active based on current route
const isActive = (tabTo: string) => {
  return route.path.startsWith(tabTo)
}
</script>

<template>
  <nav class="tabsbar">
    <div class="tabsbar__inner">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        class="tab"
        :class="{ 'tab--active': isActive(tab.to) }"
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
  justify-content: center;
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
