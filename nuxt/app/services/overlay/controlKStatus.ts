// PIP-556: Control K shows one status line of fixed height. Every source
// proposes at most one message; the most important one wins, the rest waits
// (errors stay readable in Notifiche). Same priority on screen and in tests.
import { useI18n, type TranslationKey } from '~/i18n'

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
const KNOWN_REASONS: Array<[RegExp, TranslationKey]> = [
  [/\[visione:pausa-setup\]/, 'quickPanel.status.pauseSetup'],
  [/\[dati:(stale|state-missing|disconnected)\]/, 'quickPanel.status.dataStale'],
  [/\[dati:session\]/, 'quickPanel.status.dataSession'],
  [/\[dati:capability\]/, 'quickPanel.status.dataCapability'],
]

export function readableReason(reason: string | null | undefined): string {
  const { t } = useI18n()
  const text = String(reason ?? '').trim()
  for (const [pattern, readable] of KNOWN_REASONS) if (pattern.test(text)) return t(readable)
  const plain = text.replace(/\[[a-z]+:[^\]]*\]\s*/gi, '').replace(/^[^:]{0,40}…:\s*/, '').trim()
  return plain || t('quickPanel.status.failed')
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface ControlKNotificationError {
  /** Stable identity: category + text, to know whether it has been read. */
  key: string
  /** Status line text: "Category: reason". */
  label: string
}

// Card class -> category shown before the reason. Friend requests are recognised by
// their class, never by the (translated) category text.
const FRIENDS_ERROR_CLASS = 'control-k-request__error'
const CATEGORIES: Array<[string, TranslationKey]> = [
  ['fuel-status--error', 'quickPanel.status.categoryFuel'],
  ['quick-panel-pressure-status--error', 'quickPanel.status.categoryPressure'],
  [FRIENDS_ERROR_CLASS, 'quickPanel.status.categoryFriends'],
  ['pressure-test__error', 'quickPanel.status.categoryEstimate'],
]

/** Reads one error card of the Notifiche view (the first paragraph is its reason). */
export function notificationErrorFromElement(element: Element): ControlKNotificationError {
  const category = useI18n().t(CATEGORIES.find(([cls]) => element.classList.contains(cls))?.[1] ?? 'quickPanel.status.categoryOther')
  const reason = readableReason((element.querySelector('p') ?? element).textContent)
  return { key: `${category}|${reason}`, label: `${category}: ${reason}` }
}

/**
 * PIP-556: what a Notifiche card is.
 * - action: waits for the driver (pressure plan to apply, friend request): never cleared;
 * - error: stays until solved or cleared, announced in the status line (not friend requests);
 * - info: an outcome to read once (estimate result, fuel set): leaves when Notifiche closes.
 */
export type ControlKNotificationKind = 'action' | 'error' | 'info'
export interface ControlKNotificationItem extends ControlKNotificationError {
  kind: ControlKNotificationKind
  /** Shown in the status line while unread. */
  announce: boolean
}

export function notificationItemFromElement(element: Element): ControlKNotificationItem {
  const classes = element.classList
  if (classes.contains('pressure-plan') || (classes.contains('control-k-request') && !element.querySelector('.control-k-request__error'))) {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    return { key: `azione|${classes.contains('pressure-plan') ? 'piano' : 'amicizia'}|${text}`, label: text, kind: 'action', announce: false }
  }
  const errorElement = CATEGORIES.some(([cls]) => classes.contains(cls)) ? element : element.querySelector(CATEGORIES.map(([cls]) => `.${cls}`).join(', '))
  if (errorElement) {
    const error = notificationErrorFromElement(errorElement)
    return { ...error, kind: 'error', announce: !errorElement.classList.contains(FRIENDS_ERROR_CLASS) }
  }
  // The whole card is the identity: a new estimate with other values is new information.
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
  return { key: `info|${text}`, label: text, kind: 'info', announce: false }
}

/**
 * PIP-697: order of the cards (ACC shows one per page). A friend request comes first: it waits
 * for the driver and was lost behind other cards; then errors, decisions, outcomes.
 */
export function notificationRank(item: Pick<ControlKNotificationItem, 'key' | 'kind'>): number {
  if (item.kind === 'action' && item.key.startsWith('azione|amicizia|')) return -1
  return { error: 0, action: 1, info: 2 }[item.kind]
}

/** PIP-697: an outcome is news for a moment, not a to-do: it leaves after this time. */
export const OUTCOME_VISIBLE_MS = 10_000

/**
 * Tracks when each outcome card appeared (mutates `seenAt`) and returns the ones to clear now
 * plus the delay to the next expiry (null when nothing is waiting).
 */
export function expireOutcomeCards(items: Pick<ControlKNotificationItem, 'key' | 'kind'>[], seenAt: Map<string, number>, now: number,
  visibleMs = OUTCOME_VISIBLE_MS): { expired: string[], nextInMs: number | null } {
  const infoKeys = new Set(items.filter(item => item.kind === 'info').map(item => item.key))
  for (const key of [...seenAt.keys()]) if (!infoKeys.has(key)) seenAt.delete(key)
  for (const key of infoKeys) if (!seenAt.has(key)) seenAt.set(key, now)
  const expired = [...seenAt].filter(([, seen]) => seen + visibleMs <= now).map(([key]) => key)
  const waiting = [...seenAt].filter(([key]) => !expired.includes(key)).map(([, seen]) => seen + visibleMs - now)
  return { expired, nextInMs: waiting.length ? Math.max(0, Math.min(...waiting)) : null }
}
