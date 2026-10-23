// PIP-591 (X-A06-14): cosa il pannello lezioni puo' offrire, con le stesse condizioni delle Rules
// `users/{pilot}/coachLessons`: scrive solo un coach che e' il coach assegnato del pilota, e
// modifica solo le lezioni di cui e' autore. Admin e coach subentrati leggono, non scrivono.
export function canCreateCoachLesson(params: {
  isCoach: boolean
  uid: string | null | undefined
  pilotCoachId: string | null | undefined
}): boolean {
  return params.isCoach && !!params.uid && params.pilotCoachId === params.uid
}

export function canEditCoachLesson(params: {
  isCoach: boolean
  uid: string | null | undefined
  pilotCoachId: string | null | undefined
  lessonCoachId: string | null | undefined
}): boolean {
  return canCreateCoachLesson(params) && params.lessonCoachId === params.uid
}

/** Messaggio per un salvataggio rifiutato, in italiano e senza dettagli tecnici. */
export function coachLessonSaveErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  return code === 'permission-denied'
    ? 'Non puoi salvare: solo il coach assegnato al pilota può scrivere le sue lezioni.'
    : 'Salvataggio non riuscito. Riprova.'
}
