<script setup lang="ts">
// PIP-645: Semplice on the whole session: three places to work on, each in one plain sentence.
// A row selects its corner (map and charts follow); the colour matches the stretch on the map.
import { computed } from 'vue'
import { ZONE_COLORS, zoneSeconds, type SessionZones } from '~/services/telemetry/sessionZones'
import { useI18n } from '~/i18n'

const props = defineProps<{ insight: SessionZones, selected: number | null, totalLaps: number }>()
const emit = defineEmits<{ select: [corner: number] }>()
const { t } = useI18n()

const rows = computed(() => {
  const { leastConsistent: c, mostPotential: p, mostMistakes: m } = props.insight
  return [
    { key: 'consistency', title: t('telemetry.zones.consistencyTitle'), color: ZONE_COLORS.consistency, corner: c?.corner.number ?? null,
      text: c ? t('telemetry.zones.consistency', { n: c.corner.number, s: zoneSeconds(c.spreadS) }) : t('telemetry.zones.consistencyNone') },
    { key: 'potential', title: t('telemetry.zones.potentialTitle'), color: ZONE_COLORS.potential, corner: p?.corner.number ?? null,
      text: p ? t('telemetry.zones.potential', { n: p.corner.number, s: zoneSeconds(p.potentialS) }) : t('telemetry.zones.potentialNone') },
    { key: 'mistakes', title: t('telemetry.zones.mistakesTitle'), color: ZONE_COLORS.mistakes, corner: m?.corner.number ?? null,
      text: m ? t(m.mistakes === 1 ? 'telemetry.zones.mistakesOne' : 'telemetry.zones.mistakesMany', { n: m.corner.number, count: m.mistakes, total: props.totalLaps, s: zoneSeconds(m.mistakeLossS) }) : t('telemetry.zones.mistakesNone') },
  ]
})
</script>

<template>
  <section class="side-box zones">
    <h4>{{ t('telemetry.zones.title') }} <small>{{ t('telemetry.zones.laps', { laps: insight.laps }) }}</small></h4>
    <div class="zone-list">
      <button v-for="r in rows" :key="r.key" type="button" class="zone-row" :class="{ active: r.corner !== null && selected === r.corner }" :disabled="r.corner === null" @click="r.corner !== null && emit('select', r.corner)">
        <i class="zone-mark" :style="{ background: r.corner !== null ? r.color : '#ffffff1f' }" />
        <span class="zone-title">{{ r.title }}</span>
        <span class="zone-text">{{ r.text }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.side-box { display: grid; gap: 8px; padding: 10px; border: 1px solid #ffffff1f; background: #ffffff06;
  h4 { margin: 0 0 2px; color: #fff; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .02em;
    small { color: #77777d; font: 500 10px 'Inter', sans-serif; text-transform: none; margin-left: 4px; } } }
.zone-list { display: grid; gap: 3px; }
.zone-row { display: grid; grid-template-columns: 6px 170px minmax(0, 1fr); gap: 3px; padding: 0; border: 0; background: none; color: #e6e6ea; text-align: left; cursor: pointer;
  &:disabled { cursor: default; opacity: .7; }
  &.active .zone-title { background: #fff; color: #0b0b10; }
  &.active .zone-text { box-shadow: inset 0 0 0 1px #fff; } }
.zone-title { display: flex; align-items: center; padding: 6px 10px; background: #ffffff0d; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
.zone-text { display: flex; align-items: center; padding: 6px 10px; background: #ffffff08; font-size: 13px; }
@media (max-width: 700px) { .zone-row { grid-template-columns: 6px minmax(0, 1fr); } .zone-text { grid-column: 2; } }
</style>
