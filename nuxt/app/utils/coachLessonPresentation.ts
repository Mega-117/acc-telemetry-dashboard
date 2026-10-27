// PIP-665: how a coach lesson is shown, shared by the coach panel and the pilot's profile card.
// Display only: saved values (category, turn, dates) are never rewritten here.
import { translate, useI18n } from '~/i18n'
import type { CoachFeedbackItem, CoachFeedbackType, CoachLesson } from '~/repositories/coachLessonsRepository'

/** Feedback categories: `value` is what the lesson stores (Italian, unchanged); the key is only for display. */
export const COACH_FEEDBACK_CATEGORIES = [
  { id: 'general', value: translate('it', 'coachLessons.category.general') },
  { id: 'entry', value: translate('it', 'coachLessons.category.entry') },
  { id: 'braking', value: translate('it', 'coachLessons.category.braking') },
  { id: 'brakeRelease', value: translate('it', 'coachLessons.category.brakeRelease') },
  { id: 'apex', value: translate('it', 'coachLessons.category.apex') },
  { id: 'exit', value: translate('it', 'coachLessons.category.exit') },
  { id: 'traffic', value: translate('it', 'coachLessons.category.traffic') },
  { id: 'consistency', value: translate('it', 'coachLessons.category.consistency') },
] as const

/** Stored value of the default category of a new feedback. */
export const DEFAULT_COACH_FEEDBACK_CATEGORY = COACH_FEEDBACK_CATEGORIES[1].value

export function coachFeedbackCategoryLabel(stored: string): string {
  const known = COACH_FEEDBACK_CATEGORIES.find(category => category.value === stored)
  return known ? useI18n().t(`coachLessons.category.${known.id}`) : stored
}

export function coachFeedbackTypeLabel(type: CoachFeedbackType): string {
  const { t } = useI18n()
  if (type === 'issue' || type === 'action' || type === 'positive') return t(`coachLessons.feedbackType.${type}`)
  return t('coachLessons.feedbackType.fallback')
}

export function coachFeedbackContext(item: CoachFeedbackItem): string {
  const parts = []
  if (item.turn) parts.push(/^curva/i.test(item.turn) ? item.turn : useI18n().t('coachLessons.turn', { turn: item.turn }))
  if (item.category) parts.push(coachFeedbackCategoryLabel(item.category))
  return parts.join(' - ')
}

export function formatCoachDate(value: string, withYear = true): string {
  const { t, intlLocale } = useI18n()
  if (!value) return t('coachLessons.dateNotSet')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(intlLocale.value, {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function coachLessonLinks(lesson: CoachLesson) {
  const { t } = useI18n()
  return [
    { label: t('coachLessons.links.pilotTrackTitan'), url: lesson.trackTitanPilotUrl },
    { label: t('coachLessons.links.coachTrackTitan'), url: lesson.trackTitanReferenceUrl },
    { label: t('coachLessons.links.recording'), url: lesson.recordingUrl }
  ].filter((link) => Boolean(link.url))
}
