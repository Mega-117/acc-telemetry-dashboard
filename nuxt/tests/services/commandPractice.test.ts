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
} from '~/services/onboarding/commandPractice'
import type { WheelControlAction } from '~/services/controls/wheelBindingModel'

const press = (actions: WheelControlAction[]) => actions.reduce(applyPracticePress, initialPractice())

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
    expect(practiceDone(s)).toBe(false)
    s = applyPracticePress(s, 'togglePalette')
    expect(s.open).toBe(false)
    expect(practiceDone(s)).toBe(true)
    expect(s.task).toBe(PRACTICE_TASKS.length)
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
