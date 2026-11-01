<script setup lang="ts">
// PIP-695: "Usa un link": the link of a lap shows whose lap it is before it is used; the link of a session
// lists its laps with the proposed one said out loud. Errors in plain words; the comparison is untouched.
import { ref, useId, watch } from 'vue'
import LapChoiceRow from './LapChoiceRow.vue'
import { classifyLink, type LapChoice } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource, LinkResult } from '~/composables/useLapChoice'
import { useI18n } from '~/i18n'

const props = defineProps<{ source: LapChoiceSource, selectedKey: string | null, currentKey: string | null, otherKey: string | null, otherSide: string }>()
const emit = defineEmits<{ select: [choice: LapChoice | null], confirm: [choice: LapChoice], wholeSession: [] }>()
const { t } = useI18n()
const id = useId()

const text = ref('')
const busy = ref(false)
const result = ref<LinkResult | null>(null)
let attempt = 0
// 01/11 (Codex): a new text forgets the lap of the old one, so "Usa" never applies a link no longer written.
watch(text, () => { result.value = null; if (props.selectedKey) emit('select', null) })

async function check() {
  if (busy.value || !text.value.trim()) return
  if (classifyLink(text.value) === 'unknown') { result.value = { state: 'error', message: t('telemetry.choice.link.unknown') }; emit('select', null); return }
  const mine = ++attempt
  busy.value = true
  try {
    const answer = await props.source.resolveLink(text.value)
    if (mine !== attempt || !answer) return
    result.value = answer
    if (answer.state === 'error') emit('select', null)
    if (answer.state === 'lap') emit('select', answer.choice)
    else if (answer.state === 'session') {
      const proposed = answer.choices.find(c => c.key === answer.proposedKey)
      if (proposed) emit('select', proposed)
    }
  } finally {
    if (mine === attempt) busy.value = false
  }
}
</script>

<template>
  <div class="link-choice">
    <div class="link-choice__field">
      <label :for="`${id}-input`">{{ t('telemetry.choice.link.label') }} <small>{{ t('telemetry.choice.link.hint') }}</small></label>
      <div class="link-choice__row">
        <input :id="`${id}-input`" v-model="text" type="text" :placeholder="t('telemetry.choice.link.placeholder')" autocomplete="off" spellcheck="false" @keydown.enter.prevent="check">
        <button type="button" class="choice-btn" :disabled="busy || !text.trim()" @click="check">{{ busy ? t('telemetry.choice.link.checking') : t('telemetry.choice.link.check') }}</button>
      </div>
    </div>
    <p v-if="result?.state === 'error'" class="choice-error" role="alert">{{ result.message }}</p>
    <template v-else-if="result?.state === 'lap'">
      <p class="choice-order">{{ t('telemetry.choice.link.preview') }}</p>
      <LapChoiceRow :choice="result.choice" :selected="result.choice.key === selectedKey" :current="result.choice.key === currentKey"
        :other-side="result.choice.key === otherKey ? otherSide : null" @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
    </template>
    <template v-else-if="result?.state === 'session'">
      <p class="choice-order">{{ t('telemetry.choice.link.sessionOf', { driver: result.driver || t('telemetry.choice.driver') }) }} · {{ t('telemetry.choice.mine.order') }}</p>
      <p v-if="!result.choices.length" class="choice-empty">{{ t('telemetry.choice.link.sessionNone') }}</p>
      <template v-else>
        <p v-if="result.proposedKey" class="choice-empty" role="status">{{ t('telemetry.choice.link.sessionProposed') }}</p>
        <div class="choice-list">
          <LapChoiceRow v-for="lap in result.choices" :key="lap.key" :choice="{ ...lap, best: lap.key === result.proposedKey }" :selected="lap.key === selectedKey" :current="lap.key === currentKey"
            :other-side="lap.key === otherKey ? otherSide : null" hide-when @select="emit('select', $event)" @confirm="emit('confirm', $event)" />
        </div>
      </template>
    </template>
    <button type="button" class="choice-link" @click="emit('wholeSession')">{{ t('telemetry.choice.dialog.wholeSession') }}</button>
  </div>
</template>

<style scoped lang="scss">
.link-choice { display: grid; gap: 10px; justify-items: start; > * { justify-self: stretch; } > .choice-link { justify-self: start; } }
.link-choice__field { display: grid; gap: 6px; label { color: #ccc; font: 600 12px 'Inter', sans-serif; small { margin-left: 8px; color: #888; font-weight: 400; } } }
.link-choice__row { display: flex; gap: 10px;
  input { flex: 1; min-width: 0; height: 42px; padding: 0 12px; border: 1px solid #ffffff30; background: #ffffff04; color: #fff; font: 500 14px 'Inter', sans-serif;
    &:focus { border-color: #fff; outline: 2px solid #fff; outline-offset: 1px; } } }
@media (max-width: 640px) { .link-choice__row { flex-direction: column; } }
</style>
