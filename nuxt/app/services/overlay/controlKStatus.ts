// PIP-556: Control K shows one status line of fixed height. Every source
// proposes at most one message; the most important one wins, the rest waits
// (errors stay readable in Notifiche). Same priority on screen and in tests.

export type ControlKStatusTone = 'error' | 'progress' | 'ok' | 'hint'

export interface ControlKStatusMessage {
  tone: ControlKStatusTone
  text: string
}

const PRIORITY: Record<ControlKStatusTone, number> = { error: 0, progress: 1, ok: 2, hint: 3 }

export function pickControlKStatus(candidates: Array<ControlKStatusMessage | null | undefined | false>): ControlKStatusMessage | null {
  let best: ControlKStatusMessage | null = null
  for (const candidate of candidates) {
    if (!candidate || !candidate.text?.trim()) continue
    if (!best || PRIORITY[candidate.tone] < PRIORITY[best.tone]) best = candidate
  }
  return best
}

// ─── Driver-readable reasons ────────────────────────────────────────────────

// Technical prefixes kept in logs and audits ("[dati:stale]", "[visione:pausa-setup]")
// become plain words for the driver; unknown ones are simply removed.
const KNOWN_REASONS: Array<[RegExp, string]> = [
  [/\[visione:pausa-setup\]/, 'Apri il menu pausa (ESC) ai box o in griglia e riprova.'],
  [/\[dati:(stale|state-missing|disconnected)\]/, 'Dati di ACC non aggiornati: riprova tra un istante.'],
  [/\[dati:session\]/, 'Sessione ACC non riconosciuta: riprova tra un istante.'],
  [/\[dati:capability\]/, 'Comandi verso ACC non pronti: riprova tra un istante.'],
]

export function readableReason(reason: string | null | undefined): string {
  const text = String(reason ?? '').trim()
  for (const [pattern, readable] of KNOWN_REASONS) if (pattern.test(text)) return readable
  const plain = text.replace(/\[[a-z]+:[^\]]*\]\s*/gi, '').replace(/^[^:]{0,40}…:\s*/, '').trim()
  return plain || 'Operazione non riuscita.'
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface ControlKNotificationError {
  /** Stable identity: category + text, to know whether it has been read. */
  key: string
  /** Status line text: "Category: reason". */
  label: string
}

const CATEGORIES: Array<[string, string]> = [
  ['fuel-status--error', 'Benzina'],
  ['quick-panel-pressure-status--error', 'Correggi pressioni'],
  ['control-k-request__error', 'Amicizie'],
  ['pressure-test__error', 'Stima pressioni'],
]

/** Reads one error card of the Notifiche view (the first paragraph is its reason). */
export function notificationErrorFromElement(element: Element): ControlKNotificationError {
  const category = CATEGORIES.find(([cls]) => element.classList.contains(cls))?.[1] ?? 'Avviso'
  const reason = readableReason((element.querySelector('p') ?? element).textContent)
  return { key: `${category}|${reason}`, label: `${category}: ${reason}` }
}
