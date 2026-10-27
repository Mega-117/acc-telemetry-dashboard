<script setup lang="ts">
import { standingsManufacturerFromModel, standingsManufacturerLogo } from '~/services/overlay/standingsManufacturer'
import { usePublicPath } from '~/composables/usePublicPath'
import { useI18n } from '~/i18n'

export interface RacingSessionRow {
  id: string
  time: string
  type: 'practice' | 'qualify' | 'race' | 'unknown'
  game?: string
  track: string
  car: string
  laps: number
  stints: number
  bestQualy?: string
  bestRace?: string
  bestLap?: string
}
defineProps<{
  groups: { date: string; sessions: RacingSessionRow[] }[]
  hideTrack?: boolean
  sessionHref?: (id: string) => string
}>()
const emit = defineEmits<{ 'go-to-session': [id: string] }>()
const { t, intlLocale } = useI18n()
// Logo del costruttore accanto all'auto (lo stesso set della classifica HUD), solo se il marchio e' noto.
const { getPublicPath } = usePublicPath()
function carLogo(car: string) {
  const key = standingsManufacturerFromModel(car)
  if (!key) return null
  // Copie piccole ricampionate (public/standings/manufacturers/small): ridurre nel browser l'originale da ~170 px a 18 px lo sgrana.
  return standingsManufacturerLogo(key, path => getPublicPath(path.replace('/manufacturers/', '/manufacturers/small/')))
}

function formatDateHeader(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!)
  return Number.isNaN(date.getTime()) ? t('sessions.list.noDate') : date.toLocaleDateString(intlLocale.value, { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
}
function getTypeLabel(type: RacingSessionRow['type']) {
  return t(`sessions.type.${type}`)
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
            :aria-label="t('sessions.list.dayAria', { date: formatDateHeader(group.date) })"
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
                    {{ t('sessions.list.type') }}
                  </th><th scope="col">
                    {{ t('sessions.list.time') }}
                  </th><th v-if="!hideTrack" scope="col">
                    {{ t('sessions.list.track') }}
                  </th><th scope="col">
                    {{ t('sessions.list.car') }}
                  </th>
                  <th scope="col">
                    {{ t('sessions.list.laps') }}
                  </th><th scope="col">
                    {{ t('sessions.list.stints') }}
                  </th><th scope="col">
                    {{ t('sessions.list.qualifyTime') }}
                  </th><th scope="col">
                    {{ t('sessions.list.raceTime') }}
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
                    <span :class="['session-kind', `session-kind--${session.type}`]">{{ session.type === 'practice' ? t('sessions.type.practiceShort') : getTypeLabel(session.type) }}</span>
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
                      :aria-label="t('sessions.list.openAria', { type: getTypeLabel(session.type), track: session.track, date: formatDateHeader(group.date), time: session.time })"
                      @click="openSession($event, session.id)"
                    >
                      {{ session.track }}
                    </component>
                  </td>
                  <td
                    class="session-car"
                    :title="session.car"
                  >
                    <span class="session-car__line">
                      <img v-if="carLogo(session.car)" :src="carLogo(session.car)!.src" alt="" class="session-car__logo">
                      <component
                        :is="sessionHref ? 'a' : 'button'"
                        v-if="hideTrack"
                        :type="sessionHref ? undefined : 'button'"
                        :href="sessionHref?.(session.id)"
                        class="session-open"
                        :aria-label="t('sessions.list.openAria', { type: getTypeLabel(session.type), track: session.track, date: formatDateHeader(group.date), time: session.time })"
                        @click="openSession($event, session.id)"
                      >{{ session.car }}</component>
                      <span v-else>{{ session.car }}</span>
                    </span>
                  </td>
                  <td class="session-stat">
                    {{ session.laps }} <span>{{ session.laps === 1 ? t('sessions.list.lap') : t('sessions.list.lapsUnit') }}</span>
                  </td>
                  <td class="session-stat session-stat--stints">
                    {{ session.stints }} <span>{{ t('sessions.list.stintUnit') }}</span>
                  </td>
                  <td class="session-best session-best--qualify">
                    <abbr class="best-label" :title="t('sessions.list.qualifyTitle')">{{ t('sessions.list.qualifyAbbr') }}</abbr><span :class="{ 'is-empty': !session.bestQualy }">{{ session.bestQualy || '–' }}</span>
                  </td>
                  <td class="session-best session-best--race">
                    <abbr class="best-label" :title="t('sessions.list.raceTitle')">{{ t('sessions.list.raceAbbr') }}</abbr><span :class="{ 'is-empty': !session.bestRace }">{{ session.bestRace || '–' }}</span>
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
// Tipo di sessione: stesso stile delle card dei best nel dettaglio pista (bordo al 36%, fondo all'8% del colore).
.session-kind { display: inline-flex; justify-content: center; align-items: center; min-width: 74px; min-height: 24px; padding: 0 6px; border: 1px solid color-mix(in srgb, currentColor 36%, transparent); border-radius: 0; background: color-mix(in srgb, currentColor 8%, transparent); font: 600 10px/1 'Inter', sans-serif; letter-spacing: .5px; text-transform: uppercase; }
.session-kind--practice { color: var(--racing-practice); } .session-kind--qualify { color: var(--racing-qualify); } .session-kind--race { color: var(--racing-race); } .session-kind--unknown { color: var(--racing-data-muted); }
// Date come titoli di sezione; tempi nel corsivo sportivo, non in grassetto.
.racing-day-table caption { @include controls.section-title; font-size: 15px; letter-spacing: .04em; padding: 0 0 10px; }
.session-best > span { font: italic 500 14px/1 'Racer Display', sans-serif; letter-spacing: .03em; }
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
// Giri / stint in maiuscolo, piccoli, come le altre etichette del sito.
.session-stat span { margin-left: 6px; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; }
.session-row .session-stat--stints { text-align: right; padding-right: 24px; }
.session-row .session-best--qualify { padding-left: 24px; }
.session-car, .session-stat span { color: var(--racing-data-muted); }
.session-car { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
// Logo del costruttore prima del nome; il nome si accorcia con i puntini se non c'e' spazio.
.session-car__line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.session-car__line > :last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-car__logo { width: 28px; height: 18px; flex-shrink: 0; object-fit: contain; }
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
// PIP-639: phones and portrait tablets - each session is a compact block instead of a wide table row:
// type, time and track on top, the car below, laps / stints / Q / G at the bottom.
@media (max-width: 960px) {
  .racing-day-table, .racing-session-list--track .racing-day-table { min-width: 0; }
  .racing-day-table colgroup { display: none; }
  .racing-day-table tbody { display: block; }
  .session-row { display: grid; grid-template-columns: 84px 56px minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: 'type time track track' 'car car car car' 'laps stints q g'; column-gap: 8px; row-gap: 4px; padding: 10px 6px; border-bottom: 1px solid var(--racing-data-line); }
  .session-row td { display: block; height: auto; padding: 0; border: 0; }
  .session-type { grid-area: type; &::after { display: none; } }
  .session-time { grid-area: time; text-align: left; }
  .session-track { grid-area: track; }
  .session-car { grid-area: car; }
  .racing-session-list--track .session-car { grid-area: track; }
  .session-stat:not(.session-stat--stints) { grid-area: laps; text-align: left; }
  .session-row .session-stat--stints { grid-area: stints; text-align: left; padding-right: 0; }
  .session-row .session-best--qualify { grid-area: q; padding-left: 0; &::before { display: none; } }
  .session-best--race { grid-area: g; }
}
// Portrait tablets have room for two lines: who / where / with what, then the numbers.
@media (min-width: 640px) and (max-width: 960px) {
  .session-row { grid-template-columns: 84px 56px minmax(0, 1fr) minmax(0, 1.3fr); grid-template-areas: 'type time track car' 'laps stints q g'; }
  .racing-session-list--track .session-row { grid-template-areas: 'type time car car' 'laps stints q g'; }
  .racing-session-list--track .session-car { grid-area: car; }
}
// Very narrow phones: a lap time needs about 80 px, so Q and G get a row of their own.
@media (max-width: 380px) {
  .session-row { grid-template-areas: 'type time track track' 'car car car car' 'laps laps stints stints' 'q q g g'; }
}

</style>
