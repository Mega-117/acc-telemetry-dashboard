import { describe, expect, it } from 'vitest'
import {
  applyKeyboardClick,
  applyKeyboardVisibility,
  CLOSE_TASK,
  initialKeyboardPractice,
  keyboardPracticeDone,
  applyPracticePress,
  initialPractice,
  PRACTICE_TILES,
  practiceDone,
  practiceHint,
  TRY_TASKS,
  type PracticeState,
} from '~/services/onboarding/commandPractice'
import type { WheelControlAction } from '~/services/controls/wheelBindingModel'

// The whole wheel flow in order: each command tried once, then the panel closed.
const SEQ = [TRY_TASKS.togglePalette, TRY_TASKS.nextAction, TRY_TASKS.previousAction, TRY_TASKS.activateAction, TRY_TASKS.mainMenu, CLOSE_TASK]
const press = (actions: WheelControlAction[]) => actions.reduce((s, a) => applyPracticePress(s, a, SEQ), initialPractice())

describe('commandPractice (PIP-571)', () => {
  it('the asked sequence opens, moves, confirms, goes back and closes the pretend panel', () => {
    let s = initialPractice()
    s = applyPracticePress(s, 'togglePalette', SEQ)
    expect(s).toMatchObject({ open: true, task: 1 })
    s = applyPracticePress(s, 'nextAction', SEQ)
    expect(s).toMatchObject({ selected: 1, task: 2 })
    s = applyPracticePress(s, 'previousAction', SEQ)
    expect(s).toMatchObject({ selected: 0, task: 3 })
    s = applyPracticePress(s, 'activateAction', SEQ)
    expect(s).toMatchObject({ confirmed: 0, task: 4 })
    s = applyPracticePress(s, 'mainMenu', SEQ)
    expect(s).toMatchObject({ confirmed: null, open: true, task: 5 })
    expect(practiceDone(s, SEQ)).toBe(false)
    s = applyPracticePress(s, 'togglePalette', SEQ)
    expect(s.open).toBe(false)
    expect(practiceDone(s, SEQ)).toBe(true)
  })

  it('each command has its own one-press try', () => {
    const ready: PracticeState = { ...initialPractice(), open: true, confirmed: 2 }
    for (const action of Object.keys(TRY_TASKS) as WheelControlAction[]) {
      const tasks = [TRY_TASKS[action]]
      const start = action === 'togglePalette' ? initialPractice() : ready
      expect(practiceDone(applyPracticePress(start, action, tasks), tasks)).toBe(true)
    }
    expect(practiceDone(applyPracticePress(ready, 'mainMenu', [CLOSE_TASK]), [CLOSE_TASK])).toBe(false)
  })

  it('Indietro works like the real Back: leaves the voice, then closes the panel', () => {
    let s = press(['togglePalette', 'nextAction', 'previousAction'])
    expect(s.task).toBe(3)
    s = applyPracticePress(s, 'activateAction', SEQ)
    expect(s.task).toBe(4)
    expect(practiceHint({ ...s, confirmed: null }, SEQ)).toMatch(/Prima conferma/)
    s = applyPracticePress(s, 'mainMenu', SEQ)
    expect(s).toMatchObject({ confirmed: null, open: true, task: 5 })
    s = applyPracticePress(s, 'mainMenu', SEQ)
    expect(s.open).toBe(false)
    expect(practiceDone(s, SEQ)).toBe(true)
  })

  it('a closed panel ignores moves and confirm, and the hint says to reopen it', () => {
    let s = press(['togglePalette', 'togglePalette'])
    expect(s).toMatchObject({ open: false, task: 1 })
    expect(practiceHint(s, SEQ)).toMatch(/chiuso/)
    s = applyPracticePress(s, 'nextAction', SEQ)
    expect(s).toMatchObject({ selected: 0, count: 0, task: 1 })
    s = applyPracticePress(s, 'togglePalette', SEQ)
    expect(practiceHint(s, SEQ)).toBe('')
  })

  it('keyboard practice: open, click a voice, close; early or out-of-order steps do not count', () => {
    let s = initialKeyboardPractice()
    s = applyKeyboardVisibility(s, false)
    expect(s).toEqual({ opened: false, clicked: false, closed: false, open: false })
    s = applyKeyboardClick(s)
    expect(s.clicked).toBe(false) // nothing to click while closed
    s = applyKeyboardVisibility(s, true)
    s = applyKeyboardVisibility(s, false)
    expect(s).toMatchObject({ opened: true, clicked: false, closed: false })
    s = applyKeyboardVisibility(s, true)
    s = applyKeyboardClick(s)
    expect(keyboardPracticeDone(s)).toBe(false)
    s = applyKeyboardVisibility(s, false)
    expect(keyboardPracticeDone(s)).toBe(true)
    s = applyKeyboardVisibility(s, true)
    expect(keyboardPracticeDone(s)).toBe(true)
  })

  it('wrong buttons still move the panel but do not tick the exercise; selection wraps', () => {
    let s = press(['togglePalette', 'previousAction'])
    expect(s).toMatchObject({ selected: PRACTICE_TILES.length - 1, task: 1, count: 0 })
    s = applyPracticePress(s, 'activateAction', SEQ)
    expect(s).toMatchObject({ confirmed: PRACTICE_TILES.length - 1, task: 1 })
    s = applyPracticePress(s, 'mainMenu', SEQ)
    expect(s).toMatchObject({ task: 1, open: true })
  })
})
