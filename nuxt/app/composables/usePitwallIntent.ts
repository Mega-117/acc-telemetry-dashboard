// ============================================
// L'intento del pilota: "voglio il Pitwall aperto".
//
// E' il ponte fra chi lo chiede - la card nella pagina Pit Wall, il pannello
// rapido Ctrl+K - e chi lo esegue - il lato pilota della stanza, che gira solo
// nella finestra principale della suite (usePitwallDriverPresence). Stato a
// livello di modulo, non `useState`: lo store live e' un singleton fuori da
// qualunque componente, e deve poterlo leggere anche lui.
//
// In un browser normale non c'e' nessun PC del pilota: `available` resta falso
// e la card lo dice, invece di offrire un bottone che non fa niente.
// ============================================

import { readonly, ref, type Ref } from 'vue'
import type { PitwallDriverStatus } from '~/services/pitwall/pitwallRoomDriverService'

export interface PitwallIntentStatus extends PitwallDriverStatus {
  /** C'e' un lato pilota che puo' davvero aprire la gara. */
  available: boolean
}

export interface PitwallIntentControls {
  open: () => Promise<void>
  close: () => Promise<void>
}

export interface PitwallIntentResult {
  ok: boolean
  reason: string | null
}

export const PITWALL_INTENT_UNAVAILABLE = 'Il Pitwall si apre dall app desktop del pilota.'

const OFF: PitwallIntentStatus = { state: 'off', roomId: null, reason: null, available: false }

const status = ref<PitwallIntentStatus>({ ...OFF })
let controls: PitwallIntentControls | null = null

/** Il lato pilota si registra all'avvio e si toglie quando si ferma. */
export function registerPitwallIntentControls(next: PitwallIntentControls | null): void {
  controls = next
  if (!next) status.value = { ...OFF }
}

/** Il lato pilota racconta ogni cambio di stato; qui diventa leggibile da tutti. */
export function setPitwallIntentStatus(next: PitwallDriverStatus | null): void {
  status.value = next ? { ...next, available: true } : { ...OFF }
}

export async function requestPitwallOpen(): Promise<PitwallIntentResult> {
  if (!controls) return { ok: false, reason: PITWALL_INTENT_UNAVAILABLE }
  await controls.open()
  return { ok: true, reason: null }
}

export async function requestPitwallClose(): Promise<PitwallIntentResult> {
  if (!controls) return { ok: false, reason: PITWALL_INTENT_UNAVAILABLE }
  await controls.close()
  return { ok: true, reason: null }
}

export function usePitwallIntent(): { pitwallIntent: Readonly<Ref<PitwallIntentStatus>> } {
  return { pitwallIntent: readonly(status) }
}

/** Solo per i test: riporta il modulo allo stato di partenza. */
export function resetPitwallIntentForTests(): void {
  controls = null
  status.value = { ...OFF }
}
