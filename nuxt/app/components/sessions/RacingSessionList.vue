<script setup lang="ts">
export interface RacingSessionRow {
  id: string
  time: string
  type: 'practice' | 'qualify' | 'race'
  track: string
  car: string
  laps: number
  stints: number
  bestQualy?: string
  bestRace?: string
}
defineProps<{
  groups: { date: string; sessions: RacingSessionRow[] }[]
  hideTrack?: boolean
  sessionHref?: (id: string) => string
}>()
const emit = defineEmits<{ 'go-to-session': [id: string] }>()

function formatDateHeader(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!)
  return Number.isNaN(date.getTime()) ? 'DATA NON DISPONIBILE' : date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
}
function getTypeLabel(type: RacingSessionRow['type']) {
  return { practice: 'PROVE LIBERE', qualify: 'QUALIFICA', race: 'GARA' }[type]
}
function openSession(event: MouseEvent, id: string) {
  event.stopPropagation()
  // Preserve native link actions (new tab / copied address) in track detail.
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  emit('go-to-session', id)
}
</script>

<template>
  <div class="racing-session-list racing-data" :class="{ 'racing-session-list--track': hideTrack }">
        <div
          v-for="group in groups"
          :key="group.date"
          class="session-day"
        >
          <div
            class="racing-table-scroll"
            role="region"
            :aria-label="`Sessioni del ${formatDateHeader(group.date)}`"
            tabindex="0"
          >
            <table class="racing-day-table">
              <caption>{{ formatDateHeader(group.date) }}</caption>
              <colgroup>
                <col class="col-type" /><col class="col-time" /><col v-if="!hideTrack" class="col-track" /><col class="col-car" />
                <col class="col-laps" /><col class="col-stints" /><col class="col-best" /><col class="col-best" />
              </colgroup>
              <thead class="racing-sr-only">
                <tr>
                  <th scope="col">
                    Tipo
                  </th><th scope="col">
                    Ora
                  </th><th v-if="!hideTrack" scope="col">
                    Pista
                  </th><th scope="col">
                    Auto
                  </th>
                  <th scope="col">
                    Giri
                  </th><th scope="col">
                    Stint
                  </th><th scope="col">
                    Tempo qualifica
                  </th><th scope="col">
                    Tempo gara
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="session in group.sessions"
                  :key="session.id"
                  class="session-row"
                  @click="emit('go-to-session', session.id)"
                >
                  <td class="session-type">
                    <span :class="['racing-session-badge', `racing-session-badge--${session.type}`]">{{ session.type === 'practice' ? 'LIBERE' : getTypeLabel(session.type) }}</span>
                  </td>
                  <td class="session-time">
                    {{ session.time }}
                  </td>
                  <td v-if="!hideTrack" class="session-track">
                    <component
                      :is="sessionHref ? 'a' : 'button'"
                      :type="sessionHref ? undefined : 'button'"
                      :href="sessionHref?.(session.id)"
                      class="session-open"
                      :aria-label="`Apri sessione ${getTypeLabel(session.type)}, ${session.track}, ${formatDateHeader(group.date)}, ${session.time}`"
                      @click="openSession($event, session.id)"
                    >
                      {{ session.track }}
                    </component>
                  </td>
                  <td
                    class="session-car"
                    :title="session.car"
                  >
                    <component
                      :is="sessionHref ? 'a' : 'button'"
                      v-if="hideTrack"
                      :type="sessionHref ? undefined : 'button'"
                      :href="sessionHref?.(session.id)"
                      class="session-open"
                      :aria-label="`Apri sessione ${getTypeLabel(session.type)}, ${session.track}, ${formatDateHeader(group.date)}, ${session.time}`"
                      @click="openSession($event, session.id)"
                    >{{ session.car }}</component>
                    <template v-else>{{ session.car }}</template>
                  </td>
                  <td class="session-stat">
                    {{ session.laps }} <span>{{ session.laps === 1 ? 'giro' : 'giri' }}</span>
                  </td>
                  <td class="session-stat session-stat--stints">
                    {{ session.stints }} <span>stint</span>
                  </td>
                  <td class="session-best session-best--qualify">
                    <abbr class="best-label" title="Tempo di qualifica">Q</abbr><span :class="{ 'is-empty': !session.bestQualy }">{{ session.bestQualy || '–' }}</span>
                  </td>
                  <td class="session-best session-best--race">
                    <abbr class="best-label" title="Tempo di gara">G</abbr><span :class="{ 'is-empty': !session.bestRace }">{{ session.bestRace || '–' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.racing-session-list { @include controls.tokens; }
.session-open { text-decoration: none; }
.racing-session-list--track {
  .racing-day-table { min-width: 720px; }
  .col-type { width: 12%; }
  .col-time { width: 9%; }
  .col-car { width: 25%; }
  .col-laps, .col-stints { width: 10%; }
  .col-best { width: 17%; }
}
.session-day + .session-day { margin-top: 36px; }
.session-days[aria-busy="true"] { opacity: .55; pointer-events: none; }
.session-row { cursor: pointer; }
.session-row:hover, .session-row:focus-within { background: linear-gradient(90deg, #ffffff16, #ffffff09); }
.col-type { width: 9%; } .col-time { width: 9%; } .col-track { width: 16%; } .col-car { width: 23%; }
.col-laps, .col-stints { width: 9%; } .col-best { width: 12.5%; }
.session-type { position: relative; }
.session-type::after { content: ''; position: absolute; right: 0; top: 9px; bottom: 9px; border-right: 1px solid var(--racing-data-line); }
.session-time, .session-stat { text-align: center; }
.session-stat span { margin-left: 6px; }
.session-row .session-stat--stints { text-align: right; padding-right: 24px; }
.session-row .session-best--qualify { padding-left: 24px; }
.session-car, .session-stat span { color: var(--racing-data-muted); }
.session-car { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.session-open { width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.session-best { white-space: nowrap; font-variant-numeric: tabular-nums; }
.session-best--qualify { color: var(--racing-qualify); position: relative; }
.session-best--qualify::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; border-left: 1px solid var(--racing-data-line); }
.session-best--race { color: var(--racing-race); }
.best-label { color: var(--racing-data-muted); display: inline-block; width: 24px; }
.session-best .is-empty { color: var(--racing-data-muted); }
.session-row:hover,.session-row:focus-within { background: var(--rc-hover); }
.session-type { white-space: nowrap; }
.best-label { text-decoration: none; }
.session-best--race { color: color-mix(in srgb,var(--racing-race) 80%,white); }

</style>
