<script setup lang="ts">
// PIP-645: Semplice on the whole session: three places to work on, each in one plain sentence.
// A row selects its corner (map and charts follow); the colour matches the stretch on the map.
import { computed } from 'vue'
import { ZONE_COLORS, zoneSeconds, type SessionZones } from '~/services/telemetry/sessionZones'

const props = defineProps<{ insight: SessionZones, selected: number | null, totalLaps: number }>()
const emit = defineEmits<{ select: [corner: number] }>()

const rows = computed(() => {
  const { leastConsistent: c, mostPotential: p, mostMistakes: m } = props.insight
  return [
    { key: 'consistency', title: 'Dove sei meno costante', color: ZONE_COLORS.consistency, corner: c?.corner.number ?? null,
      text: c ? `Curva ${c.corner.number}: varii di ${zoneSeconds(c.spreadS)} s da un giro all’altro` : 'Sei costante in tutte le curve.' },
    { key: 'potential', title: 'Dove hai più potenziale', color: ZONE_COLORS.potential, corner: p?.corner.number ?? null,
      text: p ? `Curva ${p.corner.number}: il tuo giro tipico è ${zoneSeconds(p.potentialS)} s più lento del tuo migliore` : 'Il giro tipico è già vicino al tuo migliore ovunque.' },
    { key: 'mistakes', title: 'Dove sbagli di più', color: ZONE_COLORS.mistakes, corner: m?.corner.number ?? null,
      text: m ? `Curva ${m.corner.number}: ${m.mistakes} ${m.mistakes === 1 ? 'giro rovinato' : 'giri rovinati'} su ${props.totalLaps} (+${zoneSeconds(m.mistakeLossS)} s in tutto)` : 'Nessun giro rovinato: bene così.' },
  ]
})
</script>

<template>
  <section class="side-box zones">
    <h4>Dove lavorare <small>su {{ insight.laps }} giri validi</small></h4>
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
