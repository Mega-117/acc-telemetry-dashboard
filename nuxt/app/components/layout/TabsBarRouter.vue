<script setup lang="ts">
// ============================================
// TabsBarRouter - Navigation tabs with NuxtLink
// Auto-detects active tab from current route
// ============================================

import { useFeatureAccess } from '~/composables/useFeatureAccess'
import { usePitwallStore } from '~/composables/usePitwallStore'
import { usePitwallConceptMode } from '~/composables/usePitwallConceptMode'
import { markHudRoutePhase, startHudRouteTiming } from '~/utils/hudRoutePerformance'

defineProps<{
  backLabel?: string
  activeTab?: 'panoramica' | 'sessioni' | 'piste' | 'pitwall' | 'spotter' | 'area-pilota' | 'hud'
}>()

const emit = defineEmits<{ back: [] }>()

const route = useRoute()
const { openHome: openPitwallHome } = usePitwallConceptMode()
const { canAccess } = useFeatureAccess()
const canAccessHud = canAccess('hud')
// Quante cose aspettano una decisione sul Pit Wall: si vede dalla scheda.
const { pendingNoticeCount: pitwallPending } = usePitwallStore()

const baseTabs = [
  { id: 'panoramica', label: 'PANORAMICA', to: '/panoramica' },
  { id: 'sessioni', label: 'SESSIONI', to: '/sessioni' },
  { id: 'piste', label: 'PISTE', to: '/piste' },
  { id: 'pitwall', label: 'PITWALL', to: '/pitwall' },
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

function onTabClick(tab: { id: string }) {
  if (tab.id === 'pitwall') openPitwallHome()
  if (tab.id !== 'hud') return
  startHudRouteTiming('hud-tab-click', import.meta.dev ? 'development' : 'packaged')
  markHudRoutePhase('click')
}
</script>

<template>
  <nav class="tabsbar">
    <button v-if="backLabel" class="tabsbar__back" type="button" :aria-label="backLabel" :title="backLabel" @click="emit('back')">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
    </button>
    <div class="tabsbar__inner">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        class="tab"
        :class="{ 'tab--active': isActive(tab.to), 'tab--section-start': tab.id === 'spotter' }"
        @click="onTabClick(tab)"
      >
        {{ tab.label }}
        <span
          v-if="tab.id === 'pitwall' && pitwallPending"
          class="tab__badge"
          data-testid="pitwall-tab-badge"
        >{{ pitwallPending > 9 ? '9+' : pitwallPending }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.tabsbar {
  position: relative;
  background: rgba(255, 255, 255, 0.01);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tabsbar__back {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  display: grid; place-items: center; width: 40px; height: 40px;
  border: 1px solid transparent; background: transparent; color: #ccc; cursor: pointer;
  transition: color 150ms, background-color 150ms, border-color 150ms;
  &:hover { color: #fff; background: #ffffff0d; border-color: #ffffff30; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
}

@media (max-width: 1000px) {
  .tabsbar__inner { margin-inline: 56px; overflow-x: auto; justify-content: flex-start; }
}

.tabsbar__inner {
  display: flex;
  justify-content: center;
  gap: 8px;
  align-items: center;
  max-width: var(--app-content-max-width);
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

  &__badge {
    position: absolute;
    top: 8px;
    right: 6px;
    display: grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: $accent-danger;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
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

