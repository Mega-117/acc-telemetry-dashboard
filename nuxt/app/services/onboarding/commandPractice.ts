// PIP-571: mini-tutorial of the Ctrl+K panel driven by the pilot's own buttons. In one sentence:
// every press moves a pretend panel exactly like the real one would (open/close, next, previous,
// confirm) and the current exercise ticks off when the pilot does what it asks.
import type { WheelControlAction } from '~/services/controls/wheelBindingModel'

export const PRACTICE_TILES = [
  'Stima pressioni', 'Correggi pressioni', 'A minuti', 'Sessione', 'Pitwall',
  'Giro obiettivo', 'Settori obiettivo', 'Avvisi', 'Timer', 'Notifiche',
] as const
/** "Avvisi" opens the four voice alerts, as in the real ACC panel (QuickPanelVoiceControls). */
export const VOICE_TILE = PRACTICE_TILES.indexOf('Avvisi')
export const VOICE_ALERTS = ['Giri', 'Riferimenti', 'Pressioni', 'Target'] as const

export interface PracticeTask {
  id: 'open' | 'next' | 'previous' | 'confirm' | 'close'
  action: WheelControlAction
  times: number
  text: string
}

export const PRACTICE_TASKS: readonly PracticeTask[] = [
  { id: 'open', action: 'togglePalette', times: 1, text: 'Apri il pannello' },
  { id: 'next', action: 'nextAction', times: 2, text: 'Vai avanti di due voci' },
  { id: 'previous', action: 'previousAction', times: 1, text: 'Torna indietro di una voce' },
  { id: 'confirm', action: 'activateAction', times: 1, text: 'Conferma la voce selezionata' },
  { id: 'close', action: 'togglePalette', times: 1, text: 'Chiudi il pannello' },
]

export interface PracticeState {
  /** Index of the current exercise; equals PRACTICE_TASKS.length when finished. */
  task: number
  /** Presses already counted for the current exercise. */
  count: number
  open: boolean
  selected: number
  confirmed: number | null
}

export function initialPractice(): PracticeState {
  return { task: 0, count: 0, open: false, selected: 0, confirmed: null }
}

export function practiceDone(state: PracticeState): boolean {
  return state.task >= PRACTICE_TASKS.length
}

/** The pretend panel reacts like the real one; the exercise advances only on the asked effect. */
export function applyPracticePress(state: PracticeState, action: WheelControlAction): PracticeState {
  const tiles = PRACTICE_TILES.length
  const next = { ...state }
  let effect: PracticeTask['id'] | null = null
  if (action === 'togglePalette') {
    next.open = !state.open
    next.confirmed = null
    effect = next.open ? 'open' : 'close'
  } else if (state.open && action === 'nextAction') {
    next.selected = (state.selected + 1) % tiles
    next.confirmed = null
    effect = 'next'
  } else if (state.open && action === 'previousAction') {
    next.selected = (state.selected - 1 + tiles) % tiles
    next.confirmed = null
    effect = 'previous'
  } else if (state.open && action === 'activateAction') {
    next.confirmed = state.selected
    effect = 'confirm'
  }
  const task = PRACTICE_TASKS[state.task]
  if (task && effect === task.id) {
    next.count = state.count + 1
    if (next.count >= task.times) { next.task = state.task + 1; next.count = 0 }
  }
  return next
}

/**
 * Keyboard practice on the REAL panel: Ctrl+K is a global shortcut, so the page only learns
 * that the panel was shown or hidden. Open it once, then close it once.
 */
// Order: open with Ctrl+K, click a voice with the mouse, close with Ctrl+K.
export interface KeyboardPracticeState { opened: boolean; clicked: boolean; closed: boolean; open: boolean }

export function initialKeyboardPractice(): KeyboardPracticeState {
  return { opened: false, clicked: false, closed: false, open: false }
}

export function applyKeyboardVisibility(state: KeyboardPracticeState, visible: boolean): KeyboardPracticeState {
  if (visible) return { ...state, open: true, opened: true }
  // A close counts only after the click: closing early just means "reopen and try again".
  return { ...state, open: false, closed: state.closed || (state.opened && state.clicked) }
}

export function applyKeyboardClick(state: KeyboardPracticeState): KeyboardPracticeState {
  return state.open ? { ...state, clicked: true } : state
}

export function keyboardPracticeDone(state: KeyboardPracticeState): boolean {
  return state.opened && state.clicked && state.closed
}

/** A gentle hint when the panel state blocks the current exercise. */
export function practiceHint(state: PracticeState): string {
  const task = PRACTICE_TASKS[state.task]
  if (!task) return ''
  if (!state.open && task.id !== 'open' && task.id !== 'close') return 'Il pannello è chiuso. Riaprilo.'
  return ''
}
