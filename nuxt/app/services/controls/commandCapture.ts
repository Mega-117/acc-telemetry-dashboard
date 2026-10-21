// Shared rules for assigning wheel/keyboard commands, used by Impostazioni > Comandi and by the
// onboarding command setup (PIP-571), so both read the same readiness and the same messages.
import type { DeepReadonly } from 'vue'
import type { WheelControlsState } from '~/services/controls/wheelBindingModel'

export type CaptureSource = 'keyboard' | 'controller'
type ControlsView = DeepReadonly<WheelControlsState>

/** Whether the reader for `source` (or any reader, when null) can accept a new assignment. */
export function captureSourceReady(state: Pick<ControlsView, 'sources' | 'inputStatus'>, source: CaptureSource | null): boolean {
  if (!state.sources) return state.inputStatus !== 'unavailable' && state.inputStatus !== 'starting'
  return source ? state.sources[source].status === 'ready' : Object.values(state.sources).some(s => s.status === 'ready')
}

/** Whether an automatic-device capture ("press any button") can start right now. */
export function canBeginAutoCapture(state: ControlsView, testMode: boolean): boolean {
  return state.available && captureSourceReady(state, null)
    && (state.devices.length > 0 || state.inputBackend === 'native')
    && !state.capture && !testMode
}

const ERROR_TEXT: Record<string, string> = {
  binding_conflict: 'Questo pulsante è già assegnato a un altro comando.',
  settings_corrupt: 'Le impostazioni locali non erano valide: sono stati caricati binding vuoti.',
  settings_write_failed: 'Il comando non è stato salvato su disco. Riprova.',
  capture_ambiguous: 'Sono arrivati più pulsanti o ingressi insieme. Scegli il dispositivo nella tendina e premi nuovamente Assegna.',
  controls_unavailable: 'Collegamento ai comandi non disponibile. Riprova.',
  source_unavailable: 'Il lettore del dispositivo scelto non è disponibile.',
  key_unavailable: 'Questo tasto non è disponibile. Scegline un altro: il comando precedente è stato conservato.',
  device_disconnected: 'La periferica è stata scollegata. Ricollegala e premi Assegna.',
}

export function commandErrorText(reason: string | null | undefined): string {
  if (!reason) return ''
  return ERROR_TEXT[reason] || 'Comando non salvato. Riprova.'
}

export const KEY_HINT_INVALID = 'Usa un solo tasto: una lettera, un numero, F1–F24 o una freccia.'
export const KEY_HINT_RELEASE = 'Rilascia il tasto per salvarlo.'
