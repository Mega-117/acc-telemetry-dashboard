<script setup lang="ts">
// PIP-695: "Altri piloti": the leaderboard of best laps here (my row marked TU), a search by nickname,
// and a driver's own laps on this track and car (their best preselected), with the way back.
// 02/11: a shared link is pasted here ("Hai un link condiviso?"): the "Usa un link" tab is gone.
import { computed, nextTick, ref, useId, watch } from 'vue'
import LapChoiceRow from './LapChoiceRow.vue'
import LapChoiceLink from './LapChoiceLink.vue'
import { matchesDriver, type DriverRow, type LapChoice } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource } from '~/composables/useLapChoice'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

const props = defineProps<{ source: LapChoiceSource, selectedKey: string | null, currentKey: string | null, otherKey: string | null, otherSide: string , /** 01/11: the other side's row swaps the laps. */ canSwap?: boolean }>()
const emit = defineEmits<{ select: [choice: LapChoice | null], confirm: [choice: LapChoice] }>()
const linkOpen = ref(false)
const { t, locale } = useI18n()

const query = ref('')
const hintId = useId()
const state = computed(() => props.source.driversState())
watch(state, s => { if (s === 'ready') void props.source.loadDriverNames() }, { immediate: true })
const rows = computed(() => props.source.drivers().filter(r => matchesDriver(r.nickname, query.value)))
const seconds = (ms: number) => (Math.abs(ms) / 1000).toFixed(3).replace('.', locale.value === 'it' ? ',' : '.')
const gap = (r: DriverRow) => r.gapMs === null || r.mine ? '' : r.gapMs >= 0 ? t('telemetry.choice.drivers.gapSlower', { gap: seconds(r.gapMs) }) : t('telemetry.choice.drivers.gapFaster', { gap: seconds(r.gapMs) })

const driver = ref<DriverRow | null>(null)
const laps = ref<LapChoice[]>([])
const lapsState = ref<'loading' | 'ready' | 'error'>('loading')
const lapsError = ref('')
const listEl = ref<HTMLElement | null>(null)
const name = (r: DriverRow) => r.nickname || t('telemetry.choice.driver')
let run = 0
async function openDriver(r: DriverRow) {
  driver.value = r
  laps.value = []
  lapsState.value = 'loading'
  const mine = ++run
  try {
    const list = await props.source.listDriverLaps(r.uid)
    if (mine !== run) return
    const best = list.filter(l => l.status === 'valid').sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
    laps.value = list.map(l => ({ ...l, driver: l.driver ?? r.nickname, best: l.key === best?.key }))
    lapsState.value = 'ready'
    // Their best lap is preselected: "Usa questo giro" is one step away.
    if (best) emit('select', { ...best, driver: best.driver ?? r.nickname, best: true })
  } catch (e) {
    if (mine !== run) return
    lapsError.value = (e as Error)?.message || ''
    lapsState.value = 'error'
  }
}
function back() {
  run++
  driver.value = null
  void nextTick(() => listEl.value?.querySelector<HTMLElement>('input, button')?.focus())
}
</script>

<template>
  <div ref="listEl" class="drivers">
    <template v-if="!driver">
      <button type="button" class="drivers__link-toggle" :aria-expanded="linkOpen" @click="linkOpen = !linkOpen">{{ linkOpen ? t('telemetry.choice.drivers.hideLink') : t('telemetry.choice.drivers.hasLink') }}</button>
      <LapChoiceLink v-if="linkOpen" :source="source" :selected-key="selectedKey" :current-key="currentKey" :other-key="otherKey" :other-side="otherSide"
        @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
      <label class="drivers__search">
        <span>{{ t('telemetry.choice.drivers.search') }}</span>
        <input v-model="query" type="search" autocomplete="off" spellcheck="false" :aria-describedby="hintId">
        <small :id="hintId">{{ t('telemetry.choice.drivers.searchHint') }}</small>
      </label>
      <p class="choice-order">{{ t('telemetry.choice.drivers.order') }}</p>
      <p v-if="state === 'loading'" class="choice-empty" role="status">{{ t('telemetry.choice.drivers.loading') }}</p>
      <p v-else-if="state === 'error'" class="choice-empty" role="alert">{{ t('telemetry.choice.drivers.error') }}</p>
      <p v-else-if="!source.drivers().length" class="choice-empty">{{ t('telemetry.choice.drivers.none') }}</p>
      <p v-else-if="!rows.length" class="choice-empty">{{ t('telemetry.choice.drivers.noMatch', { query }) }}</p>
      <div v-else class="choice-list">
        <button v-for="r in rows" :key="r.uid" type="button" class="driver-row" :class="{ 'is-mine': r.mine }" @click="openDriver(r)">
          <span class="driver-row__rank">{{ r.rank }}</span>
          <span class="driver-row__name">{{ name(r) }}{{ r.mine ? ' ' : '' }}<span v-if="r.mine" class="driver-row__tag">{{ t('telemetry.choice.tagYou') }}</span></span>
          <span class="driver-row__gap">{{ gap(r) }}</span>
          <span class="driver-row__time">{{ formatLapTime(r.lapTimeMs) }}</span>
        </button>
      </div>
    </template>
    <template v-else>
      <nav class="drivers__crumb" :aria-label="t('telemetry.choice.drivers.crumb')">
        <button type="button" class="choice-link" @click="back">{{ t('telemetry.choice.drivers.back') }}</button>
        <span>{{ t('telemetry.choice.drivers.crumb') }} › <strong>{{ name(driver) }}</strong></span>
      </nav>
      <p class="choice-order">{{ t('telemetry.choice.drivers.lapsOrder') }}</p>
      <p v-if="lapsState === 'loading'" class="choice-empty" role="status">{{ t('telemetry.choice.drivers.lapsLoading', { driver: name(driver) }) }}</p>
      <p v-else-if="lapsState === 'error'" class="choice-empty" role="alert">{{ t('telemetry.choice.drivers.lapsError', { driver: name(driver), message: lapsError }) }}</p>
      <p v-else-if="!laps.length" class="choice-empty">{{ t('telemetry.choice.drivers.lapsNone', { driver: name(driver) }) }}</p>
      <div v-else class="choice-list">
        <LapChoiceRow v-for="lap in laps" :key="lap.key" :choice="lap" :selected="lap.key === selectedKey" :current="lap.key === currentKey"
          :other-side="lap.key === otherKey ? otherSide : null" :swappable="!!canSwap && lap.key === otherKey" @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.drivers { display: grid; gap: 10px; }
.drivers__link-toggle { justify-self: start; min-height: 36px; padding: 0 14px; border: 1px dashed #ffffff66; background: #ffffff0a; color: #fff; font: 700 13px 'Inter', sans-serif; cursor: pointer;
  &[aria-expanded='true'] { border-style: solid; border-color: var(--c, #fff); } &:hover { border-color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
.drivers__search { display: grid; gap: 4px; color: #ccc; font: 600 12px 'Inter', sans-serif;
  input { height: 40px; padding: 0 12px; border: 1px solid #ffffff30; background: #ffffff04; color: #fff; font: 500 14px 'Inter', sans-serif;
    &:focus { border-color: #fff; outline: 2px solid #fff; outline-offset: 1px; } }
  small { color: #8a8a90; font-weight: 400; } }
.drivers__crumb { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: #b3b3b8; font: 500 13px 'Inter', sans-serif; strong { color: #fff; } }
.driver-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 92px; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 1px solid #ffffff14; background: #ffffff05; color: #e6e6ea; text-align: left; cursor: pointer;
  &:hover { background: #ffffff10; border-color: #ffffff40; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  &.is-mine { border-left: 3px solid #38bdf8; background: #38bdf814; } }
.driver-row__rank { color: #b3b3b8; font: italic 700 15px 'Racer Display', sans-serif; text-align: right; }
.driver-row__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 13px 'Inter', sans-serif; }
.driver-row__tag { margin-left: 6px; padding: 0 5px; border: 1px solid #38bdf8; color: #38bdf8; font: 700 10px/15px 'Inter', sans-serif; }
.driver-row__gap { color: #9a9aa0; font: 500 12px 'Inter', sans-serif; }
.driver-row__time { font: italic 700 14px 'Racer Display', sans-serif; text-align: right; }
</style>
