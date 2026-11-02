<script setup lang="ts">
// PIP-695: "I miei giri" (coach: "Giri di …"). 02/11 (user, as Track Titan): first the all-time best and the ideal
// lap, then the laps of this session, then one row per past session with its best qualifying (<= 20 L) and race
// (> 20 L) lap, no date headings. A click on a time uses that lap; the row opens the session's laps.
import { computed, onMounted, ref } from 'vue'
import LapChoiceRow from './LapChoiceRow.vue'
import { mySessionRows, type LapChoice, type MySessionRow, type SessionKindBests } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource } from '~/composables/useLapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

const props = defineProps<{ source: LapChoiceSource, selectedKey: string | null, currentKey: string | null, otherKey: string | null, otherSide: string , /** 01/11: the other side's row swaps the laps. */ canSwap?: boolean }>()
const emit = defineEmits<{ select: [choice: LapChoice], confirm: [choice: LapChoice] }>()
const { t } = useI18n()
const text = useLapChoiceText()

const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const listed = ref<LapChoice[]>([])
const bests = ref<Record<string, SessionKindBests>>({})
const truncated = ref(false)
const thisSession = computed(() => {
  const laps = [...props.source.sessionLaps()].sort((a, b) => (a.lapNumber ?? 0) - (b.lapNumber ?? 0))
  const best = laps.filter(c => c.status === 'valid' && c.lapTimeMs > 0).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0]?.key
  return laps.map(c => ({ ...c, best: c.key === best }))
})
const currentToken = computed(() => props.source.sessionLaps()[0]?.sessionToken ?? null)
// The all-time best of the shown driver (also when it is the lap of "Tu": the suggestions leave that one out) and the
// ideal lap. Never the coach's own best in "Giri di …" (Codex 02/11).
const top = computed(() => {
  const suggested = props.source.suggested()
  const candidates = [...suggested.filter(c => c.reason?.kind === 'myBest'), ...thisSession.value.filter(c => c.status === 'valid'),
    ...rows.value.flatMap(r => [r.best, r.qualify, r.race]).filter((c): c is LapChoice => !!c)].filter(c => c.lapTimeMs > 0)
  const best = candidates.sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0]
  const ideal = suggested.find(c => c.reason?.kind === 'ideal')
  return [best && { ...best, best: false, reason: undefined }, ideal].filter((c): c is LapChoice => !!c)
})
const rows = computed(() => mySessionRows(listed.value, currentToken.value, bests.value))
const open = ref<Set<string>>(new Set())
function toggle(token: string) {
  const next = new Set(open.value)
  if (next.has(token)) next.delete(token); else next.add(token)
  open.value = next
}

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const [result, kinds] = await Promise.all([props.source.listMine(), props.source.sessionBests().catch(() => ({}))])
    listed.value = result.laps
    bests.value = kinds
    truncated.value = result.truncated
    // The session of the lap in use opens by itself.
    const inUse = result.laps.find(l => l.key === props.currentKey)
    if (inUse?.sessionToken && inUse.sessionToken !== currentToken.value) open.value = new Set([...open.value, inUse.sessionToken])
    state.value = 'ready'
  } catch (e) {
    error.value = (e as Error)?.message || ''
    state.value = 'error'
  }
}
onMounted(() => { void load() })
const lapCount = (n: number) => n === 1 ? t('telemetry.choice.mine.oneLap') : t('telemetry.choice.mine.laps', { count: n })
const rowProps = (lap: LapChoice) => ({ choice: lap, selected: lap.key === props.selectedKey, current: lap.key === props.currentKey,
  otherSide: lap.key === props.otherKey ? props.otherSide : null, swappable: !!props.canSwap && lap.key === props.otherKey })
const kinds = (s: MySessionRow) => s.qualify || s.race
  ? [s.qualify && { id: 'qualify', label: t('telemetry.choice.mine.qualify'), lap: s.qualify }, s.race && { id: 'race', label: t('telemetry.choice.mine.race'), lap: s.race }].filter(Boolean) as { id: string, label: string, lap: LapChoice }[]
  : s.best ? [{ id: 'best', label: t('telemetry.choice.mine.best'), lap: s.best }] : []
const blocked = (lap: LapChoice) => lap.key === props.otherKey && !props.canSwap
</script>

<template>
  <div class="my-laps">
    <section v-if="top.length" class="my-laps__block">
      <h4>{{ t('telemetry.choice.mine.top') }}</h4>
      <div class="choice-list">
        <LapChoiceRow v-for="c in top" :key="c.key" v-bind="rowProps(c)" brief @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
      </div>
    </section>
    <section v-if="thisSession.length" class="my-laps__block">
      <h4>{{ t('telemetry.choice.mine.current') }}</h4>
      <div class="choice-list">
        <LapChoiceRow v-for="lap in thisSession" :key="lap.key" v-bind="rowProps(lap)" hide-when hide-driver @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
      </div>
    </section>
    <section class="my-laps__block">
      <h4>{{ t('telemetry.choice.mine.sessions') }}</h4>
      <div v-for="s in rows" :key="s.token" class="my-session">
        <div class="my-session__row">
          <button type="button" class="my-session__head" :aria-expanded="open.has(s.token)" @click="toggle(s.token)">
            <span class="my-session__chev" aria-hidden="true">{{ open.has(s.token) ? '▾' : '▸' }}</span>
            <span>{{ text.when({ sessionToken: s.token }) || s.token }}</span>
            <span class="my-session__count">{{ lapCount(s.laps.length) }}</span>
          </button>
          <button v-for="k in kinds(s)" :key="k.id" type="button" class="my-session__kind"
            :class="{ 'is-current': k.lap.key === currentKey, 'is-best': k.lap.best }" :aria-disabled="blocked(k.lap) || undefined"
            :aria-current="k.lap.key === currentKey ? 'true' : undefined" @click="blocked(k.lap) || emit('confirm', k.lap)">
            <span class="my-session__label">{{ k.label }}</span><span class="my-session__time">{{ formatLapTime(k.lap.lapTimeMs) }}</span>
          </button>
        </div>
        <div v-if="open.has(s.token)" class="choice-list my-session__laps">
          <LapChoiceRow v-for="lap in s.laps" :key="lap.key" v-bind="rowProps(lap)" hide-when hide-driver @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
        </div>
      </div>
      <p v-if="state === 'loading'" class="choice-empty" role="status">{{ t('telemetry.choice.mine.loading') }}</p>
      <p v-else-if="state === 'error'" class="choice-empty" role="alert">
        {{ t('telemetry.choice.mine.error', { message: error }) }}
        <button type="button" class="choice-link" @click="load">{{ t('telemetry.choice.mine.retry') }}</button>
      </p>
      <p v-else-if="!rows.length" class="choice-empty">{{ t('telemetry.choice.mine.none') }}</p>
      <p v-if="truncated" class="choice-empty">{{ t('telemetry.choice.mine.truncated') }}</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.my-laps { display: grid; gap: 18px; }
.my-laps__block { display: grid; gap: 8px; h4 { margin: 0; color: #fff; font: italic 700 14px 'Racer Display', sans-serif; text-transform: uppercase; } }
.my-session { display: grid; gap: 6px; }
.my-session__row { display: flex; align-items: stretch; gap: 6px; }
.my-session__head { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 48px; padding: 10px 16px; border: 1px solid #ffffff14; background: #ffffff05; color: #e6e6ea; font: 700 15px 'Inter', sans-serif; text-align: left; cursor: pointer;
  &:hover { background: #ffffff10; border-color: #ffffff40; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; } }
.my-session__chev { width: 12px; color: #9a9aa0; }
.my-session__count { color: #9a9aa0; font: 500 13px 'Inter', sans-serif; }
.my-session__kind { display: grid; align-content: center; justify-items: end; min-width: 132px; padding: 6px 14px; border: 1px solid #ffffff14; border-left: 3px solid transparent; background: #ffffff05; color: #e6e6ea; cursor: pointer;
  &:hover { background: #ffffff10; border-color: #ffffff40; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  &.is-current { border-left-color: var(--c, #fff); background: color-mix(in srgb, var(--c, #fff) 12%, transparent); }
  &.is-best .my-session__time { color: #c084fc; }
  &[aria-disabled='true'] { color: #8a8a90; cursor: default; } }
.my-session__label { color: #9a9aa0; font: 600 11px 'Inter', sans-serif; letter-spacing: .04em; text-transform: uppercase; }
.my-session__time { font: italic 700 17px 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; }
.my-session__laps { padding-left: 18px; }
@media (max-width: 640px) { .my-session__row { flex-wrap: wrap; } .my-session__head { flex-basis: 100%; } .my-session__kind { flex: 1; } }
</style>
