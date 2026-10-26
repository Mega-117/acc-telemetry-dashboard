<script setup lang="ts">
// PIP-633: i tuoi record per pista e auto (come i record personali di Garmin): best qualifica,
// best gara e best media gara, con il giorno in cui li hai fatti. "Nuovo!" se della settimana.
import { Trophy } from '@lucide/vue'
import { personalRecords, type RecordTime } from '~/utils/statsJourney'
import type { SessionDocument } from '~/types/telemetry'
import { formatCarName, formatLapTime, formatTrackName } from '~/utils/telemetryFormat'

const props = defineProps<{ sessions: SessionDocument[], nowMs: number }>()
const records = computed(() => personalRecords(props.sessions, props.nowMs))
const showAll = ref(false)
const VISIBLE = 6
const visible = computed(() => (showAll.value ? records.value : records.value.slice(0, VISIBLE)))
const when = (t: RecordTime | null) => (t ? `${t.date.slice(8, 10)}/${t.date.slice(5, 7)}/${t.date.slice(2, 4)}` : '')
// Stessi nomi e colori del dettaglio pista: qualifica gialla, gara rossa, media gara azzurra.
const kinds = [
  { id: 'qualy', label: 'Best qualifica', cls: 'k-qualy' },
  { id: 'race', label: 'Best gara', cls: 'k-race' },
  { id: 'avgRace', label: 'Best media gara', cls: 'k-avg' },
] as const
</script>

<template>
  <section class="records" aria-labelledby="stats-records">
    <div class="records__head">
      <h2 id="stats-records">Record personali</h2>
      <span class="records__note">Di sempre, per pista e auto</span>
    </div>
    <p v-if="!records.length" class="records__empty">I record compaiono dopo le prime sessioni con giri validi.</p>
    <ul class="records__grid">
      <li v-for="r in visible" :key="r.key" class="record">
        <div class="record__title">
          <div><strong>{{ formatTrackName(r.track) }}</strong><small>{{ formatCarName(r.car) }} · {{ r.sessions }} {{ r.sessions === 1 ? 'sessione' : 'sessioni' }}</small></div>
          <span v-if="r.isNew" class="record__new"><Trophy :size="14" aria-hidden="true" />Nuovo!</span>
        </div>
        <dl class="record__times">
          <div v-for="k in kinds" :key="k.id" :class="k.cls">
            <dt>{{ k.label }}</dt>
            <dd>{{ formatLapTime(r[k.id]?.ms ?? null) }}</dd>
            <small>{{ when(r[k.id]) }}</small>
          </div>
        </dl>
      </li>
    </ul>
    <button v-if="records.length > VISIBLE" type="button" class="records__more" @click="showAll = !showAll">
      {{ showAll ? 'Mostra meno' : `Mostra tutte (${records.length})` }}
    </button>
  </section>
</template>

<style scoped lang="scss">
.records { border: 1px solid rgba(255, 255, 255, 0.3960784314); padding: 14px 16px; min-width: 0; }
h2 { margin: 0; font: italic 700 18px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
.records__head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.records__note { font-size: 12px; color: #a8a8a8; }
.records__empty { color: #9a9a9a; font-size: 13px; }
.records__grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.record { border: 1px solid #ffffff26; padding: 12px 14px; background: linear-gradient(180deg, #ffffff08, transparent); }
.record__title { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px; }
.record__title strong { display: block; font: italic 700 16px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
.record__title small { font-size: 12px; color: #a8a8a8; }
.record__new { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font: 700 11px/1 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #111; background: #ffc400; white-space: nowrap; }
.record__times { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 10px; margin: 0; }
.record__times div { border-left: 3px solid var(--k); padding-left: 8px; }
.record__times dt { font: 400 11px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #bdbdbd; }
.record__times dd { margin: 2px 0 0; font: 600 16px/1.2 'Segoe UI', sans-serif; font-variant-numeric: tabular-nums; }
.record__times small { font-size: 11px; color: #8a8a8a; }
.k-qualy { --k: var(--racing-qualify, #ffc400); }
.k-race { --k: var(--racing-race, #ff0024); }
.k-avg { --k: var(--racing-practice, #0076ff); }
.records__more { margin-top: 12px; background: #ffffff12; border: 0; color: #fff; padding: 8px 14px; cursor: pointer; font: 500 13px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; }
.records__more:hover { background: #ffffff24; }
@media (max-width: 1300px) { .records__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
