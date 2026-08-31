<script setup lang="ts">
import { computed, ref } from 'vue'
import SessionAdvancedDebrief from '~/components/session-detail/SessionAdvancedDebrief.vue'
import type { SessionDetailLap } from '~/types/sessionDetailViewModel'

type DetailPanelMode = 'standard' | 'advanced'

const props = defineProps<{
  stintNumber?: number | null
  stintType?: string | null
  laps?: SessionDetailLap[]
}>()

const emit = defineEmits<{ 'mode-change': [mode: DetailPanelMode] }>()

const activeMode = ref<DetailPanelMode>('standard')

function setMode(mode: DetailPanelMode) {
  if (activeMode.value === mode) return
  activeMode.value = mode
  emit('mode-change', mode)
}

const normalizedStintType = computed(() => {
  const type = props.stintType?.toUpperCase()
  if (type === 'Q' || type === 'QUALIFY' || type === 'QUALIFYING') return 'Qualifica'
  if (type === 'R' || type === 'RACE') return 'Gara'
  return type || 'Stint'
})

const lapCoverage = computed(() => {
  const laps = props.laps ?? []
  const usable = laps.filter(lap => {
    const valid = lap.valid ?? lap.is_valid ?? false
    const pit = lap.pit ?? lap.has_pit_stop ?? false
    return valid && !pit
  }).length

  return { usable, total: laps.length }
})
</script>

<template>
  <div class="detail-mode-shell">
    <div class="detail-mode-bar">
      <div>
        <span class="detail-mode-eyebrow">Visuale dettaglio</span>
        <p class="detail-mode-context">
          {{ normalizedStintType }}<template v-if="stintNumber">
            · Stint #{{ stintNumber }}
          </template>
        </p>
      </div>

      <div
        class="detail-mode-tabs"
        role="tablist"
        aria-label="Visuale dettaglio sessione"
      >
        <button
          id="session-detail-standard-tab"
          class="detail-mode-tab"
          :class="{ 'detail-mode-tab--active': activeMode === 'standard' }"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'standard'"
          aria-controls="session-detail-standard-panel"
          @click="setMode('standard')"
        >
          Standard
        </button>
        <button
          id="session-detail-advanced-tab"
          class="detail-mode-tab"
          :class="{ 'detail-mode-tab--active': activeMode === 'advanced' }"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'advanced'"
          aria-controls="session-detail-advanced-panel"
          @click="setMode('advanced')"
        >
          Avanzata
          <span
            class="detail-mode-preview-dot"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </div>

    <div
      v-show="activeMode === 'standard'"
      id="session-detail-standard-panel"
      class="detail-mode-standard"
      role="tabpanel"
      aria-labelledby="session-detail-standard-tab"
    >
      <slot></slot>
    </div>

    <section
      v-if="activeMode === 'advanced'"
      id="session-detail-advanced-panel"
      class="detail-mode-advanced"
      role="tabpanel"
      aria-labelledby="session-detail-advanced-tab"
      data-testid="session-advanced-preview"
    >
      <SessionAdvancedDebrief
        :usable-laps="lapCoverage.usable"
        :total-laps="lapCoverage.total"
      />
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;

.detail-mode-shell { min-width: 0; }

.detail-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: -4px 0 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-mode-eyebrow {
  display: block;
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.35px;
  text-transform: uppercase;
}

.detail-mode-context {
  margin: 5px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 650;
}

.detail-mode-tabs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
}

.detail-mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 15px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font: 750 10px/1 'Outfit', sans-serif;
  letter-spacing: 0.85px;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, box-shadow 150ms ease;

  &:hover {
    color: rgba(255, 255, 255, 0.88);
  }

  &:focus-visible {
    outline: 2px solid $racing-gold;
    outline-offset: 2px;
  }

  &--active {
    color: #fff;
    background: rgba(255, 255, 255, 0.09);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
}

.detail-mode-preview-dot { width: 5px; height: 5px; border-radius: 50%; background: $racing-gold; box-shadow: 0 0 8px rgba(255, 215, 0, 0.52); }

.detail-mode-advanced { min-width: 0; }

@media (max-width: 720px) {
  .detail-mode-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-mode-tabs { align-self: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  .detail-mode-tab { transition: none; }
}
</style>
