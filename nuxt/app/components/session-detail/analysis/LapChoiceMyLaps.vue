<script setup lang="ts">
// PIP-695: "I miei giri" (coach: "Giri di …"): by date, the session as a heading, laps by number with the
// session's fastest starred. The shown session is open first; the others open with "Mostra".
import { computed, onMounted, ref } from 'vue'
import LapChoiceRow from './LapChoiceRow.vue'
import { groupMyLaps, type LapChoice } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource } from '~/composables/useLapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { useI18n } from '~/i18n'

const props = defineProps<{ source: LapChoiceSource, selectedKey: string | null, currentKey: string | null, otherKey: string | null, otherSide: string , /** 01/11: the other side's row swaps the laps. */ canSwap?: boolean }>()
const emit = defineEmits<{ select: [choice: LapChoice], confirm: [choice: LapChoice] }>()
const { t } = useI18n()
const text = useLapChoiceText()

const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const listed = ref<LapChoice[]>([])
const truncated = ref(false)
const currentToken = computed(() => props.source.sessionLaps()[0]?.sessionToken ?? null)
const groups = computed(() => groupMyLaps([...props.source.sessionLaps(), ...listed.value], currentToken.value, new Date()))
const open = ref<Set<string>>(new Set())
const isOpen = (token: string, current: boolean) => current || open.value.has(token)
function toggle(token: string) {
  const next = new Set(open.value)
  if (next.has(token)) next.delete(token); else next.add(token)
  open.value = next
}

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const result = await props.source.listMine()
    listed.value = result.laps
    truncated.value = result.truncated
    // The session of the lap in use opens by itself.
    const inUse = result.laps.find(l => l.key === props.currentKey)
    if (inUse?.sessionToken) open.value = new Set([...open.value, inUse.sessionToken])
    state.value = 'ready'
  } catch (e) {
    error.value = (e as Error)?.message || ''
    state.value = 'error'
  }
}
onMounted(() => { void load() })
const othersCount = computed(() => groups.value.filter(g => g.bucket !== 'current').length)
const lapCount = (n: number) => n === 1 ? t('telemetry.choice.mine.oneLap') : t('telemetry.choice.mine.laps', { count: n })
const bucketLabel =(b: string) => t(`telemetry.choice.mine.${b as 'current' | 'today' | 'yesterday' | 'week' | 'older'}`)
</script>

<template>
  <div class="my-laps">
    <p class="choice-order">{{ t('telemetry.choice.mine.order') }}</p>
    <section v-for="g in groups" :key="g.bucket" class="my-laps__bucket">
      <h4>{{ bucketLabel(g.bucket) }}</h4>
      <div v-for="s in g.sessions" :key="s.token" class="my-laps__session">
        <button v-if="!s.current" type="button" class="my-laps__head" :aria-expanded="isOpen(s.token, s.current)" @click="toggle(s.token)">
          <span>{{ text.when({ sessionToken: s.token }) || s.token }}</span>
          <span class="my-laps__count">{{ lapCount(s.laps.length) }}</span>
          <span class="my-laps__show">{{ isOpen(s.token, s.current) ? t('telemetry.choice.mine.hide') : t('telemetry.choice.mine.show') }}</span>
        </button>
        <p v-else class="my-laps__head my-laps__head--current">
          <span>{{ text.when(s.laps[0]!) }}</span>
          <span class="my-laps__count">{{ lapCount(s.laps.length) }}</span>
        </p>
        <div v-if="isOpen(s.token, s.current)" class="choice-list">
          <LapChoiceRow v-for="lap in s.laps" :key="lap.key" :choice="lap" :selected="lap.key === selectedKey" :current="lap.key === currentKey"
            :other-side="lap.key === otherKey ? otherSide : null" :swappable="!!canSwap && lap.key === otherKey" hide-when hide-driver @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
        </div>
      </div>
    </section>
    <p v-if="state === 'loading'" class="choice-empty" role="status">{{ t('telemetry.choice.mine.loading') }}</p>
    <p v-else-if="state === 'error'" class="choice-empty" role="alert">
      {{ t('telemetry.choice.mine.error', { message: error }) }}
      <button type="button" class="choice-link" @click="load">{{ t('telemetry.choice.mine.retry') }}</button>
    </p>
    <p v-else-if="!othersCount" class="choice-empty">{{ t('telemetry.choice.mine.none') }}</p>
    <p v-if="truncated" class="choice-empty">{{ t('telemetry.choice.mine.truncated') }}</p>
  </div>
</template>

<style scoped lang="scss">
.my-laps { display: grid; gap: 14px; }
.my-laps__bucket { display: grid; gap: 6px; h4 { margin: 0; color: #fff; font: italic 700 14px 'Racer Display', sans-serif; text-transform: uppercase; } }
.my-laps__session { display: grid; gap: 4px; }
.my-laps__head { display: flex; align-items: center; gap: 12px; width: 100%; margin: 0; padding: 6px 10px; border: 1px solid #ffffff1f; background: #ffffff08; color: #e6e6ea; font: 600 13px 'Inter', sans-serif; text-align: left; cursor: pointer;
  &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  &--current { cursor: default; border-color: #ffffff33; } }
.my-laps__count { color: #9a9aa0; font-weight: 500; }
.my-laps__show { margin-left: auto; color: #fff; text-decoration: underline; text-underline-offset: 3px; }
</style>
