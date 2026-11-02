<script setup lang="ts">
// PIP-695: "Altri piloti". 02/11 (user): a search by nickname and, for every driver, at most two rows (best
// qualifying, best race: the Worker's rules on the stint's departure fuel), as the rows of I miei giri. A click
// uses the lap; there is no list of a driver's laps. A shared link is pasted here ("Hai un link condiviso?").
import { computed, ref, useId, watch } from 'vue'
import LapChoiceRow from './LapChoiceRow.vue'
import LapChoiceLink from './LapChoiceLink.vue'
import { matchesDriver, type LapChoice } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource } from '~/composables/useLapChoice'
import { useI18n } from '~/i18n'

const props = defineProps<{ source: LapChoiceSource, selectedKey: string | null, currentKey: string | null, otherKey: string | null, otherSide: string }>()
const emit = defineEmits<{ select: [choice: LapChoice | null], confirm: [choice: LapChoice] }>()
const linkOpen = ref(false)
const { t } = useI18n()

const query = ref('')
const hintId = useId()
const state = computed(() => props.source.driversState())
watch(state, s => { if (s === 'ready') void props.source.loadDriverNames() }, { immediate: true })
const all = computed(() => props.source.drivers())
const rows = computed(() => all.value.filter(r => matchesDriver(r.nickname, query.value)))
const rowProps = (c: LapChoice) => ({ choice: c, selected: c.key === props.selectedKey, current: c.key === props.currentKey,
  otherSide: c.key === props.otherKey ? props.otherSide : null })
</script>

<template>
  <div class="drivers">
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
    <p v-else-if="!all.length" class="choice-empty">{{ t('telemetry.choice.drivers.none') }}</p>
    <p v-else-if="!rows.length" class="choice-empty">{{ t('telemetry.choice.drivers.noMatch', { query }) }}</p>
    <div v-else class="choice-list">
      <LapChoiceRow v-for="r in rows" :key="r.choice.key" v-bind="rowProps(r.choice)" :rank="r.rank" :kind="r.kind" brief aligned
        @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
    </div>
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
</style>
