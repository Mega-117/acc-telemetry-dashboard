// Shared rules for assigning wheel/keyboard commands, used by Impostazioni > Comandi and by the
// onboarding command setup (PIP-571), so both read the same readiness and the same messages.
import type { DeepReadonly } from 'vue'
import type { WheelControlsState } from '~/services/controls/wheelBindingModel'
import { useI18n, type TranslationKey } from '~/i18n'

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

// PIP-665: texts in the dictionary (commands.error.<reason>), in the interface language.
const ERROR_REASONS = new Set(['binding_conflict', 'settings_corrupt', 'settings_write_failed', 'capture_ambiguous',
  'controls_unavailable', 'source_unavailable', 'key_unavailable', 'device_disconnected'])

export function commandErrorText(reason: string | null | undefined): string {
  if (!reason) return ''
  const key = (ERROR_REASONS.has(reason) ? `commands.error.${reason}` : 'commands.error.fallback') as TranslationKey
  return useI18n().t(key)
}

/** Dictionary keys of the key-capture hints (translated where shown, useKeyboardCapture). */
export const KEY_HINT_INVALID: TranslationKey = 'commands.keyHintInvalid'
export const KEY_HINT_RELEASE: TranslationKey = 'commands.keyHintRelease'
