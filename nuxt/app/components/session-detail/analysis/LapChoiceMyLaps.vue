<script setup lang="ts">
// PIP-695: "I miei giri" (coach: "Giri di …"). 02/11 (user, as Track Titan): first the all-time best and the ideal
// lap, then the laps of this session, then one row per past session with its best qualifying (<= 20 L) and race
// (> 20 L) lap, no date headings. 02/11 (user): only those best laps, as rows like this session's (lap, date, tags,
// Qualifica / Gara); never the whole list of a past session.
import { computed, onMounted, ref } from 'vue'
import LapChoiceRow from './LapChoiceRow.vue'
import { mySessionRows, type LapChoice, type MySessionRow, type SessionKindBests } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource } from '~/composables/useLapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { useI18n } from '~/i18n'

const props = defineProps<{ source: LapChoiceSource, selectedKey: string | null, currentKey: string | null, otherKey: string | null, otherSide: string  }>()
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
async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const [result, kinds] = await Promise.all([props.source.listMine(), props.source.sessionBests().catch(() => ({}))])
    listed.value = result.laps
    bests.value = kinds
    truncated.value = result.truncated
    state.value = 'ready'
  } catch (e) {
    error.value = (e as Error)?.message || ''
    state.value = 'error'
  }
}
onMounted(() => { void load() })
const rowProps = (lap: LapChoice) => ({ choice: lap, selected: lap.key === props.selectedKey, current: lap.key === props.currentKey,
  otherSide: lap.key === props.otherKey ? props.otherSide : null })
// One row per best lap of each past session: qualifying and race when the summary knows them, else its fastest lap.
type PastBest = { key: string, kind: 'qualify' | 'race' | null, lap: LapChoice }
const pastBests = computed(() => rows.value.flatMap((s: MySessionRow): PastBest[] => s.qualify || s.race
  ? [s.qualify && { key: `${s.token}|q`, kind: 'qualify' as const, lap: s.qualify }, s.race && { key: `${s.token}|r`, kind: 'race' as const, lap: s.race }]
    .filter((r): r is { key: string, kind: 'qualify' | 'race', lap: LapChoice } => !!r)
  : s.best ? [{ key: `${s.token}|b`, kind: null, lap: s.best }] : []))
</script>

<template>
  <div class="my-laps">
    <section v-if="top.length" class="my-laps__block">
      <h4>{{ t('telemetry.choice.mine.top') }}</h4>
      <div class="choice-list">
        <LapChoiceRow v-for="c in top" :key="c.key" v-bind="rowProps(c)" brief aligned @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
      </div>
    </section>
    <section v-if="thisSession.length" class="my-laps__block">
      <h4>{{ t('telemetry.choice.mine.current') }}</h4>
      <div class="choice-list">
        <LapChoiceRow v-for="lap in thisSession" :key="lap.key" v-bind="rowProps(lap)" hide-when hide-driver aligned @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
      </div>
    </section>
    <section class="my-laps__block">
      <h4>{{ t('telemetry.choice.mine.sessions') }}</h4>
      <div v-if="pastBests.length" class="choice-list">
        <LapChoiceRow v-for="r in pastBests" :key="r.key" v-bind="rowProps({ ...r.lap, best: false })" :kind="r.kind" aligned hide-driver @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
      </div>
      <p v-if="state === 'loading'" class="choice-empty" role="status">{{ t('telemetry.choice.mine.loading') }}</p>
      <p v-else-if="state === 'error'" class="choice-empty" role="alert">
        {{ t('telemetry.choice.mine.error', { message: error }) }}
        <button type="button" class="choice-link" @click="load">{{ t('telemetry.choice.mine.retry') }}</button>
      </p>
      <p v-else-if="!pastBests.length" class="choice-empty">{{ t('telemetry.choice.mine.none') }}</p>
      <p v-if="truncated" class="choice-empty">{{ t('telemetry.choice.mine.truncated') }}</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.my-laps { display: grid; gap: 18px; }
.my-laps__block { display: grid; gap: 8px; h4 { margin: 0; color: #fff; font: italic 700 14px 'Racer Display', sans-serif; text-transform: uppercase; } }
</style>
