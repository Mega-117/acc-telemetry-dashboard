<script setup lang="ts">
// ============================================
// TabsBarRouter - Navigation tabs with NuxtLink
// Auto-detects active tab from current route
// ============================================

defineProps<{
  activeTab?: 'panoramica' | 'sessioni' | 'piste' | 'spotter' | 'area-pilota' | 'hud'
}>()

const route = useRoute()
const { canAccess } = useFeatureAccess()
const canAccessHud = canAccess('hud')

const baseTabs = [
  { id: 'panoramica', label: 'PANORAMICA', to: '/panoramica' },
  { id: 'sessioni', label: 'SESSIONI', to: '/sessioni' },
  { id: 'piste', label: 'PISTE', to: '/piste' },
  { id: 'spotter', label: 'SPOTTER', to: '/spotter' }
]

const tabs = computed(() => {
  if (!canAccessHud.value) return baseTabs
  return [...baseTabs, { id: 'hud', label: 'HUD', to: '/hud' }]
})

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
        :class="{ 'tab--active': isActive(tab.to), 'tab--section-start': tab.id === 'spotter' }"
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
  align-items: center;
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

  &--section-start {
    margin-left: 12px;

    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: -10px;
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.16);
      transform: translateY(-50%);
    }
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

