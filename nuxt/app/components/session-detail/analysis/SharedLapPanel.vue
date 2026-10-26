<script setup lang="ts">
// PIP-623: "Giro di un altro pilota". Si incolla il link ricevuto, il giro arriva dall'archivio
// online e diventa il Riferimento. Un giro di un'altra pista non si confronta; un'altra auto si
// confronta ma con l'avviso.
import { ref, watch } from 'vue'
import { parseLapShareLink } from '~/services/telemetry/lapShareLink'
import { fetchSharedLap, LapsArchiveError, type LapsArchiveDeps } from '~/services/telemetry/lapsArchiveClient'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { loadPublicNickname } from '~/repositories/publicProfileRepository'
import { formatLapTime } from '~/utils/telemetryFormat'

export interface SharedLapLoaded { id: string, trace: LapTraceView, label: string, lapNumber: number, lapTimeMs: number, carMismatch: boolean }

const props = defineProps<{ current: LapTraceView | null, deps: LapsArchiveDeps, nickname?: (uid: string) => Promise<string | null> }>()
const emit = defineEmits<{ loaded: [lap: SharedLapLoaded], close: [] }>()

const text = ref('')
const busy = ref(false)
const error = ref('')
let attempt = 0
// A change of session or pilot invalidates a request still in flight.
watch(() => props.current, () => { attempt++; busy.value = false })

function sameContext(trace: LapTraceView, current: LapTraceView | null) {
  return !current || (trace.gameId === current.gameId && trace.track === current.track && (trace.variant ?? null) === (current.variant ?? null))
}

async function load() {
  if (busy.value) return
  const link = parseLapShareLink(text.value)
  error.value = ''
  if (!link) { error.value = 'Link non riconosciuto: incolla il link ricevuto con "Condividi giro".'; return }
  const mine = ++attempt
  busy.value = true
  try {
    const { trace: raw, meta } = await fetchSharedLap(link, props.deps)
    if (mine !== attempt) return
    const trace = normalizeLapTrace(raw)
    if (!trace) { error.value = 'Giro non valido: formato non riconosciuto.'; return }
    // Only whole, valid laps are references: a partial lap would compare different places.
    if (!trace.complete || trace.valid !== true) { error.value = 'Questo giro non è completo o valido: chiedi un altro giro.'; return }
    if (!sameContext(trace, props.current)) {
      error.value = `Questo giro è su ${trace.track}: si confronta solo con giri della stessa pista.`
      return
    }
    const nickname = (await (props.nickname ?? loadPublicNickname)(meta.ownerUid)) || 'Pilota'
    if (mine !== attempt || !sameContext(trace, props.current)) return
    const current = props.current
    const lapNumber = meta.lapNumber ?? 0
    const lapTimeMs = meta.lapTimeMs ?? Math.round(trace.lapTimeS * 1000)
    emit('loaded', {
      id: `shared:${link.shareId}`, trace, lapNumber, lapTimeMs,
      label: `${nickname} · Giro ${lapNumber} · ${formatLapTime(lapTimeMs)}`,
      carMismatch: !!current && trace.car !== current.car,
    })
    text.value = ''
  } catch (e) {
    if (mine === attempt) error.value = e instanceof LapsArchiveError ? e.message : 'Impossibile caricare il giro.'
  } finally {
    if (mine === attempt) busy.value = false
  }
}
</script>

<template>
  <div class="shared-lap" role="dialog" aria-label="Giro di un altro pilota">
    <label class="shared-field">
      <span>Link del giro</span>
      <input v-model="text" type="text" placeholder="https://…/giro#…" autocomplete="off" spellcheck="false" @keydown.enter.prevent="load">
    </label>
    <button type="button" class="shared-load" :disabled="busy || !text.trim()" @click="load">{{ busy ? 'Carico…' : 'Usa come riferimento' }}</button>
    <button type="button" class="shared-close" aria-label="Chiudi" @click="emit('close')">✕</button>
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
