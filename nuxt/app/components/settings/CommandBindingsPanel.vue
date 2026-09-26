<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'
import {
  formatWheelBinding,
  keyboardButton,
  type WheelControlAction,
} from '~/services/controls/wheelBindingModel'

const actions: Array<{ id: WheelControlAction; title: string; description: string }> = [
  { id: 'togglePalette', title: 'Apri / chiudi Control K', description: 'Mostra o nasconde il pannello comandi.' },
  { id: 'nextAction', title: 'Voce successiva', description: 'Passa alla voce successiva del pannello.' },
  { id: 'activateAction', title: 'Conferma', description: 'Attiva la voce selezionata.' },
  { id: 'mainMenu', title: 'Menu principale', description: 'Torna al menu allenamenti. Non attivo durante i timer.' },
]

const {
  state,
  testMode,
  testedActions,
  beginCapture,
  cancelCapture,
  clearBinding,
  setTestMode,
  finishConfiguration,
  captureKey,
  retrySource,
} = useWheelInputBridge()

const selectedDevice = ref('')
const keyHint = ref('')
let pendingKey: number | null = null
const devices = computed(() => state.value.devices.map((device, index) => ({
  id: device.deviceId,
  label: `${device.deviceLabel}${device.buttonCount ? ` · ${device.buttonCount} pulsanti` : ''}${state.value.devices.filter(d => d.deviceLabel === device.deviceLabel && d.buttonCount === device.buttonCount).length > 1 ? ` · ${index + 1}` : ''}`,
})))
watch(selectedDevice, () => { pendingKey = null; keyHint.value = ''; if (state.value.capture) void cancelCapture() })
const onKeyDown = (event: KeyboardEvent) => {
  if (!state.value.capture) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); void cancelCapture(); pendingKey = null; return }
  if (state.value.capture.deviceId && state.value.capture.deviceId !== 'keyboard:system') return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.repeat) return
  pendingKey = keyboardButton(event)
  keyHint.value = pendingKey === null ? 'Usa un solo tasto: una lettera, un numero, F1–F24 o una freccia.' : 'Rilascia il tasto per salvarlo.'
}
const onKeyUp = (event: KeyboardEvent) => {
  if (pendingKey === null || !state.value.capture) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (keyboardButton(event) === pendingKey) { void captureKey(pendingKey); pendingKey = null; keyHint.value = '' }
}
const onBlur = () => { pendingKey = null }
const selectedSource = computed(() => selectedDevice.value === 'keyboard:system' ? 'keyboard' : selectedDevice.value ? 'controller' : null)
const sourceReady = computed(() => {
  if (!state.value.sources) return state.value.inputStatus !== 'unavailable' && state.value.inputStatus !== 'starting'
  const source = selectedSource.value
  return source ? state.value.sources[source].status === 'ready' : Object.values(state.value.sources).some(s => s.status === 'ready')
})
const failedSources = computed(() => (['keyboard', 'controller'] as const).filter(source => state.value.sources?.[source].status === 'unavailable'))
onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', onBlur)
})

const statusText = computed(() => {
  if (!state.value.available) return 'Runtime comandi non disponibile'
  if (state.value.sources && selectedSource.value) {
    const source = state.value.sources[selectedSource.value]
    if (source.status === 'starting') return 'Avvio lettore…'
    if (source.status === 'unavailable') return selectedSource.value === 'keyboard' ? 'Lettore tastiera non disponibile.' : 'Lettore controller non disponibile.'
  }
  if (state.value.inputStatus === 'starting') return 'Ricerca delle periferiche…'
  if (state.value.inputStatus === 'unavailable') return 'Lettura dei comandi non disponibile. Riavvia la Suite per riprovare.'
  if (!state.value.devices.length) return 'Nessun controller collegato. Puoi usare la tastiera.'
  return `${state.value.devices.length} periferiche rilevate. Scegli un comando e premi Assegna.`
})
const errorText = computed(() => {
  const reason = state.value.operation?.reason || state.value.lastError
  if (!reason) return ''
  return ({
    binding_conflict: 'Questo pulsante è già assegnato a un altro comando.',
    settings_corrupt: 'Le impostazioni locali non erano valide: sono stati caricati binding vuoti.',
    settings_write_failed: 'Il comando non è stato salvato su disco. Riprova.',
    capture_ambiguous: 'Sono arrivati più pulsanti o ingressi insieme. Scegli il dispositivo nella tendina e premi nuovamente Assegna.',
    controls_unavailable: 'Collegamento ai comandi non disponibile. Riprova.',
    source_unavailable: 'Il lettore del dispositivo scelto non è disponibile.',
    key_unavailable: 'Questo tasto non è disponibile. Scegline un altro: il comando precedente è stato conservato.',
    device_disconnected: 'La periferica è stata scollegata. Ricollegala e premi Assegna.',
  } as Record<string, string>)[reason] || 'Comando non salvato. Riprova.'
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('keyup', onKeyUp, true)
  window.removeEventListener('blur', onBlur)
  void finishConfiguration()
})
</script>

<template>
  <section class="commands-panel" aria-labelledby="commands-title">
    <header class="commands-panel__header">
      <div>
        <p class="eyebrow">VOLANTE, TASTIERA E BUTTON BOX</p>
        <h2 id="commands-title">Comandi</h2>
        <p>Scegli Assegna e premi il tasto o il pulsante da usare.</p>
      </div>
      <button
        type="button"
        class="test-button"
        :class="{ 'is-active': testMode }"
        :disabled="!state.available || !!state.capture"
        @click="setTestMode(!testMode)"
      >
        {{ testMode ? 'Termina prova' : 'Prova comandi' }}
      </button>
    </header>

    <div class="device-row">
      <label for="command-device">Dispositivo</label>
      <select id="command-device" v-model="selectedDevice" :disabled="testMode">
        <option value="">Rileva automaticamente</option>
        <option v-if="state.inputBackend === 'native'" value="keyboard:system">Tastiera / tastierino / button box</option>
        <option v-for="device in devices" :key="device.id" :value="device.id">{{ device.label }}</option>
        <option v-if="selectedDevice && selectedDevice !== 'keyboard:system' && !devices.some(d => d.id === selectedDevice)" :value="selectedDevice">Dispositivo scollegato</option>
      </select>
      <span :class="['device-status', { 'is-connected': !!state.devices.length }]">{{ statusText }}</span>
      <div v-for="source in failedSources" :key="source" role="status">
        {{ source === 'keyboard' ? 'Lettore tastiera non avviato.' : 'Lettore controller non avviato.' }}
        <button type="button" class="test-button" :disabled="!state.available || !!state.capture" @click="retrySource(source)">Riprova {{ source === 'keyboard' ? 'tastiera' : 'controller' }}</button>
      </div>
      <span v-if="state.inputBackend === 'native' && !state.sources" class="device-status">La separazione dei lettori richiede l’aggiornamento della Suite desktop.</span>
    </div>

    <p v-if="errorText" class="command-error" role="alert">{{ errorText }}</p>
    <p v-if="state.ambiguousDeviceIds?.length" class="command-error" role="alert">
      Più periferiche hanno lo stesso identificativo: {{ state.ambiguousDeviceIds.join(', ') }}.
      Seleziona il dispositivo e assegna nuovamente il pulsante.
    </p>
    <p v-if="state.unavailableKeys?.length" class="command-error" role="alert">Un tasto assegnato non è disponibile per la Suite. Premi Assegna e scegli un altro tasto.</p>
    <p v-if="state.capture" class="capture-hint" role="status">
      {{ keyHint || 'Premi il pulsante o il tasto da assegnare. Esc per annullare.' }}
    </p>
    <p v-if="testMode" class="capture-hint" role="status">Premi i comandi: si illumineranno qui senza azionare il pannello.</p>
    <p v-if="selectedDevice === 'keyboard:system' || Object.values(state.bindings).some(b => b?.deviceId === 'keyboard:system')" class="keyboard-note">Scegli un tasto libero: mentre la Suite è attiva viene riservato al comando. Le button box che inviano tasti usano questa voce.</p>

    <div class="command-list">
      <article
        v-for="action in actions"
        :key="action.id"
        class="command-row"
        :class="{
          'is-capturing': state.capture?.action === action.id,
          'is-tested': testedActions.includes(action.id),
        }"
      >
        <div class="command-row__copy">
          <strong>{{ action.title }}</strong>
          <span>{{ action.description }}</span>
        </div>
        <div class="binding-copy">
          <code>{{ formatWheelBinding(state.bindings[action.id]) }}</code>
          <span v-if="state.disconnectedActions?.includes(action.id)">{{ state.bindings[action.id]?.deviceId.startsWith('raw:') ? 'Dispositivo scollegato. Ricollegalo oppure premi Assegna.' : 'Premi Assegna per confermare la periferica di questo comando.' }}</span>
        </div>
        <div class="command-row__actions">
          <button
            v-if="state.capture?.action !== action.id"
            type="button"
            :disabled="!state.available || !sourceReady || (!state.devices.length && state.inputBackend !== 'native') || !!state.capture || testMode"
            @click="beginCapture(action.id, selectedDevice)"
          >
            Assegna
          </button>
          <button v-else type="button" @click="cancelCapture">Annulla</button>
          <button
            type="button"
            class="remove-button"
            :disabled="!state.bindings[action.id] || !!state.capture || testMode"
            @click="clearBinding(action.id)"
          >
            Rimuovi
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.commands-panel { color: #eee; min-width: 0; max-width: 940px; --rc-control-height: 34px; }
.commands-panel__header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding-bottom: 16px; }
h2 { margin: 0 0 6px; padding-left: 14px; border-left: 3px solid var(--racing-race); font-size: 20px; font-weight: 550; }
p { margin: 0; color: #aaa; font-size: 13px; line-height: 1.6; }
.eyebrow { display: none; }
.test-button,.command-row button { @include controls.action; white-space: nowrap; }
.test-button.is-active { color: #21ff83; background: #21ff8314; }
.device-row { display: grid; grid-template-columns: auto minmax(180px,320px); align-items: center; justify-content: start; gap: 8px 16px; padding: 0 0 16px; }
.device-row label { font-size: 13px; }
.device-row select { @include controls.field; appearance: none; width: 100%; padding: 9px 38px 9px 12px; text-overflow: ellipsis; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23ccc' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
.device-status,.device-row > div { grid-column: 1 / -1; color: #ffc400; font-size: 12px; }.device-status.is-connected { color: #21ff83; }
.binding-copy { display: grid; gap: 6px; min-width: 0; }.binding-copy span { font-size: 12px; color: #ffc400; }
.keyboard-note { font-size: 12px; margin: 10px 0; }
.command-error,.capture-hint { padding: 12px 14px; margin-bottom: 12px; border-left: 2px solid currentColor; background: #ff002410; color: #ff7188; }
.capture-hint { background: #0076ff15; color: #70b1ff; }
.command-list { display: grid; margin-top: 8px; }
.command-row { display: grid; grid-template-columns: minmax(200px,1fr) minmax(120px,180px) auto; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid #ffffff25; transition: background .16s ease; }
.command-row:hover { background: linear-gradient(110deg,#ffffff09,transparent); }
.command-row.is-capturing { background: #0076ff12; }.command-row.is-tested { background: #21ff8314; }
.command-row__copy { display: grid; gap: 3px; }.command-row__copy strong { font-size: 13px; font-weight: 550; }.command-row__copy span { color: #999; font-size: 12px; line-height: 1.5; }
.command-row code { color: #ddd; padding: 6px 10px; border: 1px solid #ffffff25; background: #ffffff05; width: fit-content; max-width: 100%; font-family: inherit; font-size: 12px; overflow-wrap: anywhere; }
.command-row__actions { display: flex; gap: 8px; }.command-row .remove-button { color: #ff7188; }
@media(max-width:1150px) { .command-row { grid-template-columns: 1fr auto; }.binding-copy { grid-column: 1; }.command-row__actions { grid-column: 2; grid-row: 1 / span 2; } }
@media(max-width:900px) { .commands-panel__header { flex-direction: column; } }
@media(max-width:600px) { .command-row { grid-template-columns: 1fr; }.command-row__actions { grid-column: 1; grid-row: auto; }.device-row { grid-template-columns: 1fr; } }
@media(prefers-reduced-motion:reduce) { .command-row { transition: none; } }
.commands-panel .device-row select { @include controls.select; }
.command-row:hover { background: var(--rc-hover); }
</style>
