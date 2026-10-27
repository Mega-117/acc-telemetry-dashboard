import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canCreateCoachLesson, canEditCoachLesson, coachLessonSaveErrorMessage } from '~/utils/coachLessonPermissions'
import { setLocale } from '~/i18n'
import { COACH_FEEDBACK_CATEGORIES, coachFeedbackContext, coachFeedbackTypeLabel } from '~/utils/coachLessonPresentation'

setLocale('it')

// PIP-591 (X-A06-14): le stesse condizioni delle Rules coachLessons.
describe('coach lesson permissions', () => {
  it('only the assigned coach writes', () => {
    expect(canCreateCoachLesson({ isCoach: true, uid: 'c1', pilotCoachId: 'c1' })).toBe(true)
    expect(canCreateCoachLesson({ isCoach: true, uid: 'c2', pilotCoachId: 'c1' })).toBe(false)
    expect(canCreateCoachLesson({ isCoach: false, uid: 'admin', pilotCoachId: 'admin' })).toBe(false)
    expect(canCreateCoachLesson({ isCoach: true, uid: 'c1', pilotCoachId: null })).toBe(false)
  })

  it('only the author edits, and only while still the assigned coach', () => {
    expect(canEditCoachLesson({ isCoach: true, uid: 'c1', pilotCoachId: 'c1', lessonCoachId: 'c1' })).toBe(true)
    // Coach subentrato: assegnato, ma non autore della lezione.
    expect(canEditCoachLesson({ isCoach: true, uid: 'c2', pilotCoachId: 'c2', lessonCoachId: 'c1' })).toBe(false)
    // Autore non piu' assegnato.
    expect(canEditCoachLesson({ isCoach: true, uid: 'c1', pilotCoachId: 'c2', lessonCoachId: 'c1' })).toBe(false)
  })

  it('explains a rejected save', () => {
    expect(coachLessonSaveErrorMessage({ code: 'permission-denied' })).toContain('solo il coach assegnato')
    expect(coachLessonSaveErrorMessage(new Error('offline'))).toBe('Salvataggio non riuscito. Riprova.')
    setLocale('en')
    expect(coachLessonSaveErrorMessage({ code: 'permission-denied' })).toContain('only the coach assigned')
    setLocale('it')
  })

  it('the panel uses them for the save button, the Modifica button and the save error', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/coach/CoachLessonsPanel.vue'), 'utf8')
    expect(source).toContain('<button v-if="canEditLesson(lesson)"')
    expect(source).toMatch(/const canSaveLesson = computed\([\s\S]*?canWriteLessons\.value\)/)
    expect(source).toContain('errorMessage.value = coachLessonSaveErrorMessage(error)')
  })
})

// PIP-665: the feedback category is saved in Italian; only its label follows the interface language.
describe('coach lesson presentation', () => {
  it('keeps the stored categories Italian and translates only what is shown', () => {
    expect(COACH_FEEDBACK_CATEGORIES.map(category => category.value)).toEqual([
      'Commento generale', 'Entrata curva', 'Punto di frenata', 'Rilascio freno',
      'Corda', 'Uscita curva', 'Gestione traffico', 'Costanza passo',
    ])
    const item = { type: 'issue' as const, turn: '3', category: 'Entrata curva', message: 'x' }
    setLocale('en')
    expect(coachFeedbackContext(item)).toBe('Turn 3 - Corner entry')
    expect(coachFeedbackTypeLabel('issue')).toBe('Mistake')
    expect(coachFeedbackContext({ ...item, category: 'Nota libera' })).toBe('Turn 3 - Nota libera')
    setLocale('it')
    expect(coachFeedbackContext(item)).toBe('Curva 3 - Entrata curva')
    expect(coachFeedbackContext({ ...item, turn: 'Curva 5' })).toBe('Curva 5 - Entrata curva')
  })

  it('the panel offers the stored Italian value and shows the translated label', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/coach/CoachLessonsPanel.vue'), 'utf8')
    expect(source).toContain(':value="category.value">{{ t(`coachLessons.category.${category.id}`) }}</option>')
    expect(source).toContain('feedbackCategory: DEFAULT_COACH_FEEDBACK_CATEGORY')
  })
})
