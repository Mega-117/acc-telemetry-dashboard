<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'
import {
  formatWheelBinding,
  type WheelControlAction,
} from '~/services/controls/wheelBindingModel'

const actions: Array<{ id: WheelControlAction; title: string; description: string }> = [
  { id: 'togglePalette', title: 'Apri / chiudi Control K', description: 'Mostra o nasconde il pannello comandi.' },
  { id: 'nextAction', title: 'Voce successiva', description: 'Avanza tra le azioni disponibili e riparte dalla prima.' },
  { id: 'activateAction', title: 'Conferma', description: 'Esegue il normale click della voce evidenziata.' },
]

const {
  state,
  testMode,
  selectedDeviceId,
  testedActions,
  beginCapture,
  cancelCapture,
  clearBinding,
  setTestMode,
} = useWheelInputBridge()

const selectedDevice = computed(() => state.value.devices.find(
  device => device.deviceId === selectedDeviceId.value,
))
const statusText = computed(() => {
  if (!state.value.available) return 'Runtime comandi non disponibile'
  if (!state.value.devices.length) return 'Volante non rilevato. Premi un pulsante per attivare il Gamepad API.'
  return `Collegato: ${selectedDevice.value?.deviceLabel || state.value.devices[0]?.deviceLabel}`
})
const errorText = computed(() => {
  const reason = state.value.operation?.reason || state.value.lastError
  if (!reason) return ''
  return ({
    binding_conflict: 'Questa combinazione coincide o si sovrappone a un altro comando.',
    too_many_buttons: 'Usa al massimo due pulsanti.',
    ambiguous_input: 'Sono attivi più dispositivi: rilascia tutto e riprova.',
    wrong_device: 'Il pulsante appartiene a un dispositivo diverso da quello selezionato.',
    device_disconnected: 'Il dispositivo è stato scollegato durante la cattura.',
    settings_corrupt: 'Le impostazioni locali non erano valide: sono stati caricati binding vuoti.',
  } as Record<string, string>)[reason] || 'Comando non salvato. Rilascia i pulsanti e riprova.'
})

onBeforeUnmount(() => setTestMode(false))
</script>

<template>
  <section class="commands-panel" aria-labelledby="commands-title">
    <header class="commands-panel__header">
      <div>
        <p class="eyebrow">INPUT VOLANTE</p>
        <h2 id="commands-title">Comandi</h2>
        <p>Assegna uno o due pulsanti. La pressione lunga vale sempre come un solo comando.</p>
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
      <label for="wheel-device">Dispositivo</label>
      <select id="wheel-device" v-model="selectedDeviceId" :disabled="!state.devices.length || !!state.capture">
        <option v-if="!state.devices.length" value="">Nessun dispositivo</option>
        <option v-for="device in state.devices" :key="device.deviceId" :value="device.deviceId">
          {{ device.deviceLabel }}
        </option>
      </select>
      <span :class="['device-status', { 'is-connected': !!state.devices.length }]">{{ statusText }}</span>
    </div>

    <p v-if="errorText" class="command-error" role="alert">{{ errorText }}</p>
    <p v-if="state.capture" class="capture-hint" role="status">
      {{ state.capture.stage === 'waiting-release'
        ? 'Rilascia tutti i pulsanti…'
        : 'Premi uno o due pulsanti e rilasciali per salvare.' }}
    </p>

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
        <code>{{ formatWheelBinding(state.bindings[action.id]) }}</code>
        <div class="command-row__actions">
          <button
            v-if="state.capture?.action !== action.id"
            type="button"
            :disabled="!state.available || !selectedDeviceId || !!state.capture || testMode"
            @click="beginCapture(action.id)"
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
.commands-panel { background: #16161d; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 28px; color: #f5f5f7; }
.commands-panel__header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,.08); padding-bottom: 22px; }
h2 { margin: 4px 0 8px; font-size: 26px; } p { margin: 0; color: #9c9ca8; }
.eyebrow { color: #ff4d3d; font-size: 11px; font-weight: 800; letter-spacing: 1.7px; }
.test-button, .command-row button { border: 1px solid rgba(255,255,255,.14); background: #24242d; color: #fff; border-radius: 9px; padding: 9px 13px; cursor: pointer; }
.test-button.is-active { color: #65e6bd; border-color: rgba(101,230,189,.55); background: rgba(101,230,189,.1); }
button:disabled { opacity: .38; cursor: not-allowed; }
.device-row { display: grid; grid-template-columns: 110px minmax(220px, 1fr) minmax(260px, 1fr); gap: 14px; align-items: center; padding: 22px 0; }
.device-row label { font-weight: 700; } select { background: #0f0f15; color: #fff; border: 1px solid rgba(255,255,255,.12); border-radius: 9px; padding: 10px; }
.device-status { color: #efb35b; font-size: 13px; } .device-status.is-connected { color: #65e6bd; }
.command-error { padding: 12px 14px; background: rgba(255,77,61,.12); border: 1px solid rgba(255,77,61,.35); border-radius: 9px; color: #ff8c81; }
.capture-hint { padding: 12px 14px; background: rgba(91,157,255,.1); border-radius: 9px; color: #8eb8ff; }
.command-list { display: grid; gap: 10px; margin-top: 16px; }
.command-row { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(250px, 1fr) auto; align-items: center; gap: 18px; padding: 18px; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; background: #101016; transition: .16s ease; }
.command-row.is-capturing { border-color: rgba(91,157,255,.65); } .command-row.is-tested { border-color: #65e6bd; box-shadow: 0 0 0 2px rgba(101,230,189,.14); }
.command-row__copy { display: grid; gap: 5px; } .command-row__copy span { color: #858592; font-size: 13px; }
.command-row code { color: #d6d6df; font-family: inherit; font-size: 13px; }
.command-row__actions { display: flex; gap: 8px; } .command-row .remove-button { color: #ff8c81; }
@media (max-width: 900px) { .device-row, .command-row { grid-template-columns: 1fr; } .commands-panel__header { flex-direction: column; } }
</style>
