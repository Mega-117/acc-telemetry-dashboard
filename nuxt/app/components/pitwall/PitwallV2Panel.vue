<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { MFD_V2_METHOD, usePitwallApplicationMethod } from '~/composables/usePitwallApplicationMethod'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
import { canUseDevTools } from '~/utils/devToolsAccess'
import { boundPitwallStrategy } from '~/services/pitwall/pitwallLink'
import V2Choice from './PitwallV2Choice.vue'
const props = defineProps<{ port?: ReturnType<typeof usePitwallRoom> }>()
const { method, draft, initialized } = usePitwallApplicationMethod()
const { isAdmin } = useFirebaseAuth()
const visible = computed(() => canUseDevTools() || isAdmin.value)
const snapshot = computed(() => { const raw = props.port?.carSnapshot.value; return raw ? { ...raw, strategy: boundPitwallStrategy(raw.strategy, '') } : null })
const capable = computed(() => snapshot.value?.strategy?.applicationMethods?.includes(MFD_V2_METHOD) === true)
const ready = computed(() => capable.value && snapshot.value?.strategy?.mfdV2?.ready === true)
const busy = computed(() => props.port?.sending.value || ['pending', 'applying'].includes(props.port?.orderStatus.value ?? ''))
const wheels = ['FL', 'FR', 'RL', 'RR'] as const
const switches = [{ key: 'changeTyres', label: 'Cambio gomme' }, { key: 'brakes', label: 'Sostituisci freni' }, { key: 'repairBodywork', label: 'Riparazione carrozzeria' }, { key: 'repairSuspension', label: 'Riparazione sospensioni' }] as const
const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const driverRequired = computed(() => (snapshot.value?.strategy?.mfdV2?.driverCount ?? 0) > 0)
const validDriver = computed(() => !driverRequired.value || snapshot.value?.crew?.some(d => d.driverIndex === draft.driverId))
const mounted = computed(() => draft.changeTyres && draft.compound === 'dry' && draft.tyreSet === snapshot.value?.strategy?.fittedTyreSet)
const missing = computed(() => {
  const fields: string[] = []
  if (!integer(draft.fuelLiters, 0, 140)) fields.push('carburante (0–140 L)')
  for (const f of switches) if (typeof draft[f.key] !== 'boolean') fields.push(f.label.toLowerCase())
  if (draft.repairSuspension && !draft.repairBodywork) fields.push('carrozzeria richiesta con le sospensioni')
  if (!validDriver.value) fields.push('pilota dell’equipaggio')
  if (mounted.value) fields.push('un set diverso da quello montato')
  if (draft.brakes) for (const k of ['brakeFront', 'brakeRear'] as const) {
    if (!integer(draft[k], 1, 4)) fields.push(k === 'brakeFront' ? 'pastiglie anteriori (1–4)' : 'pastiglie posteriori (1–4)')
  }
  if (draft.changeTyres) {
    if (!['dry', 'wet'].includes(draft.compound ?? '')) fields.push('mescola')
    if (draft.compound === 'dry' && !integer(draft.tyreSet, 1, 50)) fields.push('set pneumatici (1–50)')
    for (const w of wheels) {
      const v = draft.pressures[w]
      if (typeof v !== 'number' || v < 20.3 || v > 35 || !Number.isFinite(v) || Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) fields.push(`pressione ${w} (20,3–35 PSI, passi di 0,1)`)
    }
  }
  return fields
})
const transportBlock = computed(() => {
  if (busy.value) return 'Ordine in corso: attendi l’esito prima di inviarne un altro.'
  if (calibrating.value) return 'Calibrazione locale in corso.'
  if (!props.port?.canSend.value) return props.port?.sendReadiness?.value.reason || props.port?.executorLabel?.value || 'Seleziona una gara con un solo pilota connesso e disponibile.'
  if (!capable.value) return 'Il PC del pilota non annuncia V2: avvia il runtime della Suite aggiornato sul suo PC.'
  if (!ready.value) return snapshot.value?.strategy?.mfdV2?.reason || 'Calibrazione V2 richiesta sul PC del pilota.'
  return null
})
const sendBlock = computed(() => transportBlock.value || (missing.value.length ? `Completa: ${missing.value.join(', ')}.` : null))
const sendMessage = ref<string | null>(null)
function loadLive() {
  const car = snapshot.value?.strategy
  if (!car) return
  draft.fuelLiters = car.fuelToAdd
  draft.tyreSet = car.tyreSet == null ? null : car.tyreSet + 1
  draft.compound = car.compound
  for (const w of wheels) draft.pressures[w] = car.pressures?.[w] ?? null
  for (const f of switches) { const v = car.verifiedFields?.[f.key]?.observed; draft[f.key] = typeof v === 'boolean' ? v : null }
  for (const k of ['brakeFront', 'brakeRear'] as const) { const v = car.verifiedFields?.[k]?.observed; draft[k] = typeof v === 'number' ? v : null }
  const driver = car.verifiedFields?.driverId?.observed
  draft.driverId = typeof driver === 'number' ? driver : null
}
watch([method, snapshot], () => {
  // The port exposes shared composable refs as its control API; the prop itself is never replaced.
  // eslint-disable-next-line vue/no-mutating-props
  if (props.port) props.port.draftSuspended.value = method.value === MFD_V2_METHOD
  if (method.value === MFD_V2_METHOD && !initialized.value && snapshot.value?.strategy) { loadLive(); initialized.value = true }
}, { immediate: true })
function setSwitch(key: typeof switches[number]['key'], value: boolean) {
  draft[key] = value
  if (key === 'repairSuspension' && value === true) draft.repairBodywork = true
  if (key === 'repairBodywork' && value === false) draft.repairSuspension = false
}
async function send(preset = false) {
  const blocked = preset ? transportBlock.value || (!integer(draft.pitStrategy, 1, 30) ? 'Scegli un preset da 1 a 30.' : null) : sendBlock.value
  if (blocked || !props.port) { sendMessage.value = blocked; return }
  sendMessage.value = null
  const p: Record<string, unknown> = preset ? { operation: 'preset', pitStrategy: draft.pitStrategy } : {
    operation: 'strategy', fuelLiters: draft.fuelLiters, changeTyres: draft.changeTyres, brakes: draft.brakes,
    repairBodywork: draft.repairBodywork, repairSuspension: draft.repairSuspension,
    ...(driverRequired.value ? { driverId: draft.driverId } : {}),
    ...(draft.brakes ? { brakeFront: draft.brakeFront, brakeRear: draft.brakeRear } : {}),
    ...(draft.changeTyres ? { compound: draft.compound, pressures: { ...draft.pressures }, ...(draft.compound === 'dry' ? { tyreSet: draft.tyreSet } : {}) } : {}),
  }
  try {
    const sent = await props.port.sendPlan({ method: MFD_V2_METHOD, mfdV2: p })
    if (!sent) sendMessage.value = props.port.orderReason.value || props.port.lastError?.value || 'Strategia non inviata. Controlla il collegamento con il pilota e riprova manualmente.'
  } catch (error) {
    sendMessage.value = error instanceof Error ? error.message : 'Invio non riuscito. Riprova manualmente.'
  }
}
type Sample = { id: string, text: string, glyph: number[] }
type CalibrationResult = { ok?: boolean, ready?: boolean, reason?: string, unmapped?: Sample[], crew?: { driverIndex: number, name: string }[] }
const localApi = typeof window === 'undefined' ? null : (window as unknown as { electronAPI?: { pitwallV2Calibration?: (v: unknown) => Promise<CalibrationResult> } }).electronAPI
const calibrating = ref(false), calibrationMessage = ref(''), samples = ref<Sample[]>([]), associations = ref<Record<string, number>>({})
const localCrew = ref<{ driverIndex: number, name: string }[]>([])
async function calibrate(action: 'calibrate' | 'associate' | 'status') {
  if (busy.value || calibrating.value || !localApi?.pitwallV2Calibration) return
  calibrating.value = true
  try {
    const r = await localApi.pitwallV2Calibration({ action, assignments: Object.entries(associations.value).map(([id, driverId]) => ({ id, driverId })) })
    samples.value = r.unmapped ?? []; localCrew.value = r.crew ?? []; calibrationMessage.value = r.reason || (r.ready ? 'Calibrazione pronta.' : 'Associa i nomi non riconosciuti.');
  } catch { calibrationMessage.value = 'Calibrazione non riuscita.' } finally { calibrating.value = false }
}
const outcome = computed(() => props.port?.orderMethod.value === MFD_V2_METHOD ? props.port.orderReason.value : null)
</script>
<template>
  <section
    v-if="visible"
    class="v2-panel"
  >
    <div
      role="group"
      aria-label="Metodo di applicazione"
    >
      <button
        type="button"
        :disabled="busy || calibrating"
        :aria-pressed="method === 'standard'"
        @click="method = 'standard'"
      >
        Standard
      </button>
      <button
        type="button"
        :disabled="busy || calibrating"
        :aria-pressed="method === MFD_V2_METHOD"
        @click="method = MFD_V2_METHOD"
      >
        V2 sperimentale
      </button>
    </div>
    <template v-if="method === MFD_V2_METHOD">
      <p role="status">
        {{ ready ? 'PC del pilota pronto per V2.' : snapshot?.strategy?.mfdV2?.reason || 'Supporto V2 del PC del pilota non confermato.' }}
      </p>
      <div class="preset">
        <label>Preset<input
          v-model.number="draft.pitStrategy"
          type="number"
          min="1"
          max="30"
          :disabled="busy || calibrating"
        /></label><p>Caricare un preset modifica in blocco il MFD. La bozza sottostante rimane invariata.</p><button
          type="button"
          :disabled="!!transportBlock || !integer(draft.pitStrategy, 1, 30)"
          @click="send(true)"
        >
          Carica preset
        </button>
      </div>
      <form @submit.prevent="send()">
        <fieldset :disabled="busy || calibrating">
          <legend>Strategia completa V2</legend>
          <p>Ogni invio imposta tutte le voci abilitate. I valori sconosciuti vanno completati.</p>
          <button
            type="button"
            @click="loadLive"
          >
            Aggiorna dai dati disponibili
          </button>
          <p class="source">
            Carburante, set e pressioni: dati ACC. Altre voci: ultimo riscontro verificato a schermo.
          </p>
          <label>Carburante (L)<input
            v-model.number="draft.fuelLiters"
            type="number"
            min="0"
            max="140"
            step="1"
          /></label>
          <V2Choice
            label="Cambio gomme"
            :model-value="draft.changeTyres"
            @update:model-value="setSwitch('changeTyres', $event)"
          />
          <label>Mescola<select
            v-model="draft.compound"
            :disabled="draft.changeTyres !== true"
          ><option
            :value="null"
            disabled
          >Scegli…</option><option value="dry">Dry</option><option value="wet">Wet</option></select></label>
          <label>Set pneumatici<input
            v-model.number="draft.tyreSet"
            type="number"
            min="1"
            max="50"
            :disabled="draft.changeTyres !== true || draft.compound !== 'dry'"
          /></label>
          <p
            v-if="mounted"
            role="alert"
          >
            Il set richiesto è già montato: scegli un altro treno.
          </p>
          <label
            v-for="w in wheels"
            :key="w"
          >Pressione {{ w }} (PSI)<input
            v-model.number="draft.pressures[w]"
            type="number"
            min="20.3"
            max="35"
            step="0.1"
            :disabled="draft.changeTyres !== true"
          /></label>
          <V2Choice
            label="Sostituisci freni"
            :model-value="draft.brakes"
            @update:model-value="setSwitch('brakes', $event)"
          />
          <label>Pastiglie anteriori<input
            v-model.number="draft.brakeFront"
            type="number"
            min="1"
            max="4"
            :disabled="draft.brakes !== true"
          /></label>
          <p class="source">
            ↳ Ultimo riscontro a schermo: {{ snapshot?.strategy?.verifiedFields?.brakeFront?.observed ?? 'Sconosciuto' }}
          </p>
          <label>Pastiglie posteriori<input
            v-model.number="draft.brakeRear"
            type="number"
            min="1"
            max="4"
            :disabled="draft.brakes !== true"
          /></label>
          <p class="source">
            ↳ Ultimo riscontro a schermo: {{ snapshot?.strategy?.verifiedFields?.brakeRear?.observed ?? 'Sconosciuto' }}
          </p>
          <label>Pilota<select
            v-model="draft.driverId"
            :disabled="!driverRequired"
          ><option
            :value="null"
            disabled
          >{{ driverRequired ? 'Scegli…' : 'Non applicabile' }}</option><option
            v-for="d in snapshot?.crew ?? []"
            :key="d.driverIndex"
            :value="d.driverIndex"
          >{{ d.name }}</option></select></label>
          <V2Choice
            label="Riparazione sospensioni"
            :model-value="draft.repairSuspension"
            @update:model-value="setSwitch('repairSuspension', $event)"
          />
          <V2Choice
            label="Riparazione carrozzeria"
            :model-value="draft.repairBodywork"
            @update:model-value="setSwitch('repairBodywork', $event)"
          />
        </fieldset>
        <p
          v-if="sendBlock"
          id="v2-send-block"
          role="status"
        >
          {{ sendBlock }}
        </p>
        <button
          type="submit"
          :disabled="!!sendBlock"
          aria-describedby="v2-send-block"
        >
          Invia strategia V2
        </button>
      </form>
      <p
        v-if="sendMessage"
        role="alert"
      >
        {{ sendMessage }}
      </p>
      <p
        v-if="outcome"
        role="status"
      >
        {{ outcome }}
      </p>
      <table v-if="port?.orderMethod.value === MFD_V2_METHOD && Object.keys(port.orderFields.value).length">
        <thead><tr><th>Campo</th><th>Richiesto</th><th>Osservato</th><th>Esito</th></tr></thead><tbody>
          <tr
            v-for="(field, key) in port.orderFields.value"
            :key="key"
          >
            <td>{{ key }}</td><td>{{ field.requested }}</td><td>{{ field.observed ?? 'Sconosciuto' }}</td><td>{{ field.outcome }}</td>
          </tr>
        </tbody>
      </table>
      <details v-if="localApi?.pitwallV2Calibration">
        <summary>Calibrazione sul mio PC</summary><p>Da eseguire sul PC con ACC, a vettura ferma. Il menu viene navigato per apprendere cifre e nomi.</p><button
          type="button"
          :disabled="busy || calibrating"
          @click="calibrate('calibrate')"
        >
          Calibra V2
        </button><button
          type="button"
          :disabled="busy || calibrating"
          @click="calibrate('status')"
        >
          Leggi stato locale
        </button><p>{{ calibrationMessage }}</p>
        <label
          v-for="sample in samples"
          :key="sample.id"
        >{{ sample.text || 'Nome non riconosciuto' }}<svg
          viewBox="0 0 16 20"
          width="48"
          height="60"
          aria-label="Sagoma nome pilota"
        ><rect
          v-for="(pixel, i) in sample.glyph"
          :key="i"
          :x="i % 16"
          :y="Math.floor(i / 16)"
          width="1"
          height="1"
          :fill="pixel ? 'white' : 'black'"
        /></svg><select v-model.number="associations[sample.id]"><option
          v-for="d in localCrew"
          :key="d.driverIndex"
          :value="d.driverIndex"
        >{{ d.name }}</option></select></label>
        <button
          v-if="samples.length"
          type="button"
          :disabled="busy || calibrating || samples.some(s => associations[s.id] == null)"
          @click="calibrate('associate')"
        >
          Conferma associazioni locali
        </button>
      </details>
    </template>
  </section>
</template>
<style scoped>
.v2-panel { padding: 14px; color: #e3e9ee; } fieldset { display: grid; gap: 10px; border: 0; padding: 12px 0; } label { display: flex; align-items: center; justify-content: space-between; gap: 12px; } input, select { width: 150px; } button, input, select { color: inherit; background: #101820; border: 1px solid #3b4752; border-radius: 6px; padding: 8px; } button { cursor: pointer; } button[aria-pressed="true"] { border-color: #ee5b22; } :disabled { opacity: .45; } .source { color: #9eaebd; font-size: 12px; } .preset, details { border-top: 1px solid #3b4752; margin-top: 14px; padding-top: 14px; }
</style>
