// PIP-641: checks of the "Aggiungi/Modifica gara" form, one message per field, shown under that field.
import { parseRaceDateTime } from './raceDateTime'
import { useI18n } from '~/i18n'

export interface RaceForm { title: string, startsAt: string, trackName: string, carName: string, simGridUrl: string, raceUrl: string }
export type RaceFormField = 'title' | 'startsAt' | 'trackName' | 'simGridUrl' | 'raceUrl'
export type RaceFormErrors = Partial<Record<RaceFormField, string>>

const LINK = /^https?:\/\/\S+$/i

export function validateRaceForm(form: RaceForm, nowMs: number): RaceFormErrors {
  const errors: RaceFormErrors = {}
  const { t } = useI18n()
  if (!form.title.trim()) errors.title = t('overview.form.titleRequired')
  const when = parseRaceDateTime(form.startsAt)
  if (!when) errors.startsAt = t('overview.form.dateRequired')
  // A past race would vanish from "Prossima gara" as soon as it is saved.
  else if (new Date(when.year, when.month, when.day, when.hour, when.minute).getTime() < nowMs) errors.startsAt = t('overview.form.datePast')
  if (!form.trackName.trim()) errors.trackName = t('overview.form.trackRequired')
  if (form.simGridUrl.trim() && !LINK.test(form.simGridUrl.trim())) errors.simGridUrl = t('overview.form.linkHttps')
  if (form.raceUrl.trim() && !LINK.test(form.raceUrl.trim())) errors.raceUrl = t('overview.form.linkHttps')
  return errors
}
