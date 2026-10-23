import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canCreateCoachLesson, canEditCoachLesson, coachLessonSaveErrorMessage } from '~/utils/coachLessonPermissions'

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
  })

  it('the panel uses them for the save button, the Modifica button and the save error', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/coach/CoachLessonsPanel.vue'), 'utf8')
    expect(source).toContain('<button v-if="canEditLesson(lesson)"')
    expect(source).toMatch(/const canSaveLesson = computed\([\s\S]*?canWriteLessons\.value\)/)
    expect(source).toContain('errorMessage.value = coachLessonSaveErrorMessage(error)')
  })
})
