<script setup lang="ts">
// PIP-623: "Giro di un altro pilota". Si incolla il link ricevuto, il giro arriva dall'archivio
// online e diventa il Riferimento. Un giro di un'altra pista non si confronta; un'altra auto si
// confronta ma con l'avviso.
import { ref, watch } from 'vue'
import type { LapsArchiveDeps } from '~/services/telemetry/lapsArchiveClient'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { loadSharedLapLink, type SharedLapLoaded } from '~/services/telemetry/sharedLapLoad'
import { useI18n } from '~/i18n'
const { t } = useI18n()

export type { SharedLapLoaded }

const props = defineProps<{ current: LapTraceView | null, deps: LapsArchiveDeps, nickname?: (uid: string) => Promise<string | null> }>()
const emit = defineEmits<{ loaded: [lap: SharedLapLoaded], close: [] }>()

const text = ref('')
const busy = ref(false)
const error = ref('')
let attempt = 0
// A change of session or pilot invalidates a request still in flight.
watch(() => props.current, () => { attempt++; busy.value = false })

async function load() {
  if (busy.value) return
  error.value = ''
  const mine = ++attempt
  busy.value = true
  const result = await loadSharedLapLink(text.value, props.current, props.deps, { nickname: props.nickname, isCurrent: () => mine === attempt })
  if (mine !== attempt || !result) return
  busy.value = false
  if (result.error) { error.value = result.error; return }
  emit('loaded', result.lap!)
  text.value = ''
}
</script>

<template>
  <div class="shared-lap" role="dialog" :aria-label="t('telemetry.sharedLap.aria')">
    <label class="shared-field">
      <span>{{ t('telemetry.sharedLap.link') }}</span>
      <input v-model="text" type="text" placeholder="https://…/giro#…" autocomplete="off" spellcheck="false" @keydown.enter.prevent="load">
    </label>
    <button type="button" class="shared-load" :disabled="busy || !text.trim()" @click="load">{{ busy ? t('sessions.picker.loadingLink') : t('telemetry.sharedLap.use') }}</button>
    <button type="button" class="shared-close" :aria-label="t('common.close')" @click="emit('close')">✕</button>
    <p v-if="error" class="shared-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.shared-lap { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; padding: 10px; border: 1px solid #fbbf24; background: #14110a; }
.shared-field { display: grid; gap: 4px; flex: 1 1 320px; color: #b3b3b8; font: 700 11px 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em;
  input { height: 34px; padding: 0 10px; border: 1px solid #ffffff2e; background: #0a0a0f; color: #e6e6ea; font: 500 13px 'Inter', sans-serif; text-transform: none; letter-spacing: 0; } }
.shared-load { height: 34px; padding: 0 14px; border: 1px solid #fbbf24; background: #fbbf2422; color: #fff; font: 700 12px 'Inter', sans-serif; cursor: pointer; &:disabled { opacity: .5; cursor: default; } }
.shared-close { height: 34px; width: 34px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; cursor: pointer; }
.shared-error { flex-basis: 100%; margin: 0; color: #ff5a6e; font-size: 12px; }
</style>
