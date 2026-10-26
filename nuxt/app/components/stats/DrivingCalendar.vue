<script setup lang="ts">
// PIP-633: un quadretto per giorno (come il calendario di Strava): piu' acceso quanto piu' hai guidato.
import { calendarWeeks, drivingHabits } from '~/utils/statsJourney'
import type { SessionDocument } from '~/types/telemetry'
import { formatDriveTime } from '~/utils/telemetryFormat'

const props = defineProps<{ sessions: SessionDocument[], nowMs: number }>()
const WEEKS = 52
const weeks = computed(() => calendarWeeks(props.sessions, WEEKS, props.nowMs))
const habits = computed(() => drivingHabits(props.sessions, props.nowMs))
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
// Etichetta del mese sulla prima settimana che lo contiene.
const monthLabels = computed(() => weeks.value.map((w, i) => {
  const m = Number(w[0]!.date.slice(5, 7)) - 1
  const prev = i ? Number(weeks.value[i - 1]![0]!.date.slice(5, 7)) - 1 : -1
  return m !== prev ? MONTHS[m] : ''
}))
const dayTitle = (d: { date: string, timeMs: number, sessions: number }) =>
  `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)} · ${d.sessions ? `${formatDriveTime(d.timeMs)} in ${d.sessions} ${d.sessions === 1 ? 'sessione' : 'sessioni'}` : 'nessuna sessione'}`
const days = (n: number) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`
</script>

<template>
  <section class="stats-panel calendar" aria-labelledby="stats-calendar">
    <div class="calendar__head">
      <h2 id="stats-calendar">Calendario di guida</h2>
      <span class="calendar__range">Ultimi 12 mesi</span>
    </div>
    <dl class="habits">
      <div><dt>Giorni in pista</dt><dd>{{ habits.daysDriven }}</dd></div>
      <div><dt>Serie più lunga</dt><dd>{{ days(habits.longestStreak) }}</dd></div>
      <div><dt>Serie in corso</dt><dd>{{ habits.currentStreak ? days(habits.currentStreak) : '–' }}</dd></div>
      <div><dt>Sessione più lunga</dt><dd>{{ habits.longestSessionMs ? formatDriveTime(habits.longestSessionMs) : '–' }}</dd></div>
    </dl>
    <div class="calendar__scroll">
      <div class="calendar__grid" role="img" aria-label="Giorni di guida negli ultimi 12 mesi">
        <div class="calendar__days" aria-hidden="true"><span>lun</span><span /><span>mer</span><span /><span>ven</span><span /><span>dom</span></div>
        <div v-for="(w, i) in weeks" :key="w[0]!.date" class="calendar__week">
          <small class="calendar__month">{{ monthLabels[i] }}</small>
          <span v-for="d in w" :key="d.date" class="calendar__day" :class="[`lvl-${d.level}`, { 'is-future': d.future }]" :title="d.future ? '' : dayTitle(d)" />
        </div>
      </div>
    </div>
    <p class="calendar__legend" aria-hidden="true">Meno <span class="calendar__day lvl-0" /><span class="calendar__day lvl-1" /><span class="calendar__day lvl-2" /><span class="calendar__day lvl-3" /><span class="calendar__day lvl-4" /> Di più</p>
  </section>
</template>

<style scoped lang="scss">
// Riquadro come gli altri delle Statistiche (lo stile della pagina non arriva dentro il componente).
.calendar { border: 1px solid rgba(255, 255, 255, 0.3960784314); padding: 14px 16px; min-width: 0; }
h2 { margin: 0; font: italic 700 18px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
.calendar__head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.calendar__range { font-size: 12px; color: #a8a8a8; }
.habits { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 12px 0 16px; }
.habits dt { font: 400 11px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #bdbdbd; }
.habits dd { margin: 4px 0 0; font: italic 700 20px/1.1 'Racer Display', sans-serif; }
// La griglia riempie la larghezza: quadretti che crescono con lo schermo (minimo 11 px, poi scorre).
.calendar__scroll { overflow-x: auto; padding-bottom: 4px; }
.calendar__grid { display: grid; grid-template-columns: 30px repeat(52, minmax(11px, 1fr)); gap: 4px; min-width: 760px; }
.calendar__days { display: grid; grid-template-rows: 16px repeat(7, 1fr); gap: 4px; font-size: 10px; color: #8a8a8a; align-items: center; }
.calendar__days span:first-child { grid-row: 2; }
.calendar__week { display: grid; grid-template-rows: 16px repeat(7, auto); gap: 4px; }
.calendar__month { font-size: 10px; color: #a8a8a8; white-space: nowrap; }
.calendar__day { display: block; width: 100%; aspect-ratio: 1; border-radius: 3px; }
.calendar__legend .calendar__day { width: 12px; height: 12px; }
.lvl-0 { background: #ffffff10; }
.lvl-1 { background: #0076ff55; }
.lvl-2 { background: #0076ff99; }
.lvl-3 { background: #2b8bff; }
.lvl-4 { background: #4dd0ff; box-shadow: 0 0 6px #4dd0ff88; }
.is-future { visibility: hidden; }
.calendar__legend { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin: 8px 0 0; font-size: 11px; color: #a8a8a8; }
@media (max-width: 1100px) { .habits { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
