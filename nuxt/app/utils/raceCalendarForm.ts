// PIP-641: checks of the "Aggiungi/Modifica gara" form, one message per field, shown under that field.
import { parseRaceDateTime } from './raceDateTime'

export interface RaceForm { title: string, startsAt: string, trackName: string, carName: string, simGridUrl: string, raceUrl: string }
export type RaceFormField = 'title' | 'startsAt' | 'trackName' | 'simGridUrl' | 'raceUrl'
export type RaceFormErrors = Partial<Record<RaceFormField, string>>

const LINK = /^https?:\/\/\S+$/i

export function validateRaceForm(form: RaceForm, nowMs: number): RaceFormErrors {
  const errors: RaceFormErrors = {}
  if (!form.title.trim()) errors.title = 'Scrivi il titolo della gara.'
  const when = parseRaceDateTime(form.startsAt)
  if (!when) errors.startsAt = 'Scegli data e ora.'
  // A past race would vanish from "Prossima gara" as soon as it is saved.
  else if (new Date(when.year, when.month, when.day, when.hour, when.minute).getTime() < nowMs) errors.startsAt = 'Questa data è già passata.'
  if (!form.trackName.trim()) errors.trackName = 'Scrivi la pista.'
  if (form.simGridUrl.trim() && !LINK.test(form.simGridUrl.trim())) errors.simGridUrl = 'Il link deve iniziare con https://'
  if (form.raceUrl.trim() && !LINK.test(form.raceUrl.trim())) errors.raceUrl = 'Il link deve iniziare con https://'
  return errors
}
