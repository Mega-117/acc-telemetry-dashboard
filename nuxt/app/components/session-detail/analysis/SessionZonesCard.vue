<script setup lang="ts">
// PIP-645: Semplice on the whole session: three places to work on.
// 05/11 (user: "a beginner must get it"): words, not codes - "Segmento 5 · Qui sbagli spesso", one plain sentence
// under it and the seconds at stake on the right; a bar in the colour of its stretch on the map. Each card has its
// own stretch (sessionZones). A card selects its corner (map and charts follow).
import { computed } from 'vue'
import { MIN_ZONE_LAPS, ZONE_COLORS, zoneSeconds, type SessionZones } from '~/services/telemetry/sessionZones'
import { useI18n } from '~/i18n'

const props = defineProps<{ insight: SessionZones, selected: number | null, totalLaps: number }>()
const emit = defineEmits<{ select: [corner: number] }>()
const { t } = useI18n()

const rows = computed(() => {
  const { leastConsistent: c, mostPotential: p, mostMistakes: m } = props.insight
  const seconds = (s: number) => `${zoneSeconds(s)} s`
  return [
    { key: 'mistakes', title: t('telemetry.zones.mistakesTitle'), color: ZONE_COLORS.mistakes, corner: m?.corner.number ?? null,
      // 05/11 (user): no seconds here - one near stop made them look like a habit.
      value: '',
      sub: m ? t(m.mistakes === 1 ? 'telemetry.zones.mistakesOne' : 'telemetry.zones.mistakesMany', { count: m.mistakes, total: props.totalLaps }) : t('telemetry.zones.mistakesNone') },
    { key: 'potential', title: t('telemetry.zones.potentialTitle'), color: ZONE_COLORS.potential, corner: p?.corner.number ?? null,
      value: p ? seconds(p.potentialS) : '', sub: p ? t('telemetry.zones.potentialSub') : t('telemetry.zones.nothingElse') },
    { key: 'consistency', title: t('telemetry.zones.consistencyTitle'), color: ZONE_COLORS.consistency, corner: c?.corner.number ?? null,
      value: c ? seconds(c.spreadS) : '', sub: c ? t('telemetry.zones.consistencySub') : t('telemetry.zones.nothingElse') },
  ]
})
</script>

<template>
  <section class="zones">
    <header class="zones__head">
      <h4>{{ t('telemetry.zones.title') }}</h4>
      <span class="zones__laps">{{ insight.laps === 1 ? t('telemetry.zones.lapsOne') : t('telemetry.zones.laps', { laps: insight.laps }) }}</span>
    </header>
    <!-- 05/11 (user): the page is always there; with too few laps it says how many it needs. -->
    <p v-if="!insight.zones.length" class="zones__few" data-testid="zones-few">{{ t('telemetry.zones.fewLaps', { min: MIN_ZONE_LAPS, laps: insight.laps }) }}</p>
    <div v-else class="zone-list" :class="{ 'has-active': rows.some(r => r.corner !== null && r.corner === selected) }">
      <button v-for="r in rows" :key="r.key" type="button" class="zone-row" :class="{ active: r.corner !== null && selected === r.corner }" :disabled="r.corner === null"
        :data-zone="r.key" :style="{ '--zone': r.corner !== null ? r.color : '#ffffff1f' }" @click="r.corner !== null && emit('select', r.corner)">
        <span class="zone-what">
          <span class="zone-title"><b v-if="r.corner !== null" class="zone-seg">{{ t('telemetry.zones.segment', { n: r.corner }) }} · </b>{{ r.title }}</span>
          <span class="zone-sub">{{ r.sub }}</span>
        </span>
        <span v-if="r.value" class="zone-value">{{ r.value }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.zones { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid #ffffff1f; background: #ffffff06; font-variant-numeric: tabular-nums; }
.zones__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  h4 { margin: 0; color: #fff; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .02em; } }
.zones__laps { color: #8a8a90; font: 600 11px 'Inter', sans-serif; }
// 05/11 (user): cards of their own height, never stretched to fill the frame under the map.
.zone-list { display: grid; grid-auto-rows: minmax(44px, auto); gap: 4px; padding: 3px; }
.zones__few { margin: 0; color: #a1a1a8; font: 500 12px/1.4 'Inter', sans-serif; }
// The bar on the left has the colour of the stretch on the map.
.zone-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 12px;
  border: 1px solid #ffffff1f; border-left: 4px solid var(--zone); background: #ffffff08; color: #e6e6ea; text-align: left; cursor: pointer; transition: background .15s ease, opacity .15s ease;
  &:hover:not(:disabled) { background: #ffffff10; }
  &.active { background: #ffffff1a; outline: 2px solid #fff; outline-offset: 1px; }
  &:disabled { cursor: default; opacity: .6; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
.has-active > .zone-row:not(.active) { opacity: .5; &:hover { opacity: .85; } }
.zone-what { display: grid; gap: 3px; min-width: 0; }
.zone-title { color: #fff; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
.zone-seg { color: var(--zone); font-weight: inherit; }
.zone-sub { color: #a1a1a8; font: 500 11px/1.35 'Inter', sans-serif; }
.zone-value { color: #fff; font: 700 16px 'Inter', sans-serif; white-space: nowrap; }
</style>
