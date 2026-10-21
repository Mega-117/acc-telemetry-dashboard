import { describe, expect, it } from 'vitest'
import {
  applyKeyboardClick,
  applyKeyboardVisibility,
  initialKeyboardPractice,
  keyboardPracticeDone,
  applyPracticePress,
  initialPractice,
  PRACTICE_TASKS,
  PRACTICE_TILES,
  practiceDone,
  practiceHint,
  practiceTasks,
} from '~/services/onboarding/commandPractice'
import type { WheelControlAction } from '~/services/controls/wheelBindingModel'

const press = (actions: WheelControlAction[]) => actions.reduce((s, a) => applyPracticePress(s, a), initialPractice())

describe('commandPractice (PIP-571)', () => {
  it('the asked sequence opens, moves, confirms and closes the pretend panel and finishes', () => {
    let s = initialPractice()
    s = applyPracticePress(s, 'togglePalette')
    expect(s).toMatchObject({ open: true, task: 1 })
    s = applyPracticePress(s, 'nextAction')
    expect(s).toMatchObject({ selected: 1, task: 1, count: 1 })
    s = applyPracticePress(s, 'nextAction')
    expect(s).toMatchObject({ selected: 2, task: 2, count: 0 })
    s = applyPracticePress(s, 'previousAction')
    expect(s).toMatchObject({ selected: 1, task: 3 })
    s = applyPracticePress(s, 'activateAction')
    expect(s).toMatchObject({ confirmed: 1, task: 4 })
    s = applyPracticePress(s, 'mainMenu')
    expect(s).toMatchObject({ confirmed: null, open: true, task: 5 })
    expect(practiceDone(s)).toBe(false)
    s = applyPracticePress(s, 'togglePalette')
    expect(s.open).toBe(false)
    expect(practiceDone(s)).toBe(true)
    expect(s.task).toBe(PRACTICE_TASKS.length)
  })

  it('Indietro works like the real Back: leaves the voice, then closes the panel (also the last exercise)', () => {
    let s = press(['togglePalette', 'nextAction', 'nextAction', 'previousAction'])
    expect(s.task).toBe(3)
    s = applyPracticePress(s, 'activateAction')
    expect(s.task).toBe(4)
    expect(practiceHint({ ...s, confirmed: null })).toMatch(/Prima conferma/)
    s = applyPracticePress(s, 'mainMenu')
    expect(s).toMatchObject({ confirmed: null, open: true, task: 5 })
    s = applyPracticePress(s, 'mainMenu')
    expect(s.open).toBe(false)
    expect(practiceDone(s)).toBe(true)
  })

  it('without the Indietro button the back exercise is left out', () => {
    const tasks = practiceTasks(false)
    expect(tasks.map(t => t.id)).toEqual(['open', 'next', 'previous', 'confirm', 'close'])
    expect(practiceTasks(true)).toBe(PRACTICE_TASKS)
    let s = initialPractice()
    for (const a of ['togglePalette', 'nextAction', 'nextAction', 'previousAction', 'activateAction', 'togglePalette'] as WheelControlAction[]) s = applyPracticePress(s, a, tasks)
    expect(practiceDone(s, tasks)).toBe(true)
    expect(practiceHint(s, tasks)).toBe('')
  })

  it('a closed panel ignores moves and confirm, and the hint says to reopen it', () => {
    let s = press(['togglePalette', 'togglePalette'])
    expect(s).toMatchObject({ open: false, task: 1 })
    expect(practiceHint(s)).toMatch(/chiuso/)
    s = applyPracticePress(s, 'nextAction')
    expect(s).toMatchObject({ selected: 0, count: 0, task: 1 })
    s = applyPracticePress(s, 'togglePalette')
    expect(practiceHint(s)).toBe('')
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
    s = applyPracticePress(s, 'activateAction')
    expect(s).toMatchObject({ confirmed: PRACTICE_TILES.length - 1, task: 1 })
    s = applyPracticePress(s, 'mainMenu')
    expect(s).toMatchObject({ task: 1, open: true })
  })
})
