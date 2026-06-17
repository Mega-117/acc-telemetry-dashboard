import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  LAP_TIME_AUDIO_DEFAULT_SPEED,
  LAP_TIME_AUDIO_MAX_TENTHS,
  LAP_TIME_AUDIO_MIN_TENTHS,
  LAP_TIME_AUDIO_VOICES,
  buildLapTimeVoiceCatalog,
  isLapTimeAudioVoice,
  type LapTimeAudioVoice,
} from '../../../app/services/overlay/lapTimeAnnouncer'

async function fileMeta(filename: string) {
  try {
    const info = await stat(join(process.cwd(), 'public', 'voice', 'qualifying', filename))
    return { exists: true, bytes: info.size, updatedAt: info.mtime.toISOString() }
  } catch {
    return { exists: false, bytes: 0, updatedAt: null }
  }
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const query = getQuery(event)
  const voiceQuery = String(query.voice || '').trim()
  const voices: LapTimeAudioVoice[] = voiceQuery
    ? (isLapTimeAudioVoice(voiceQuery) ? [voiceQuery] : [])
    : [...LAP_TIME_AUDIO_VOICES]
  if (!voices.length) {
    throw createError({ statusCode: 400, statusMessage: 'Voce non valida' })
  }

  const fromTenths = Number(query.fromTenths || LAP_TIME_AUDIO_MIN_TENTHS)
  const toTenths = Number(query.toTenths || LAP_TIME_AUDIO_MAX_TENTHS)
  if (!Number.isFinite(fromTenths) || !Number.isFinite(toTenths)) {
    throw createError({ statusCode: 400, statusMessage: 'Range non valido' })
  }

  const entries = []
  for (const voice of voices) {
    for (const entry of buildLapTimeVoiceCatalog(voice, fromTenths, toTenths)) {
      entries.push({ ...entry, ...(await fileMeta(entry.filename)) })
    }
  }

  return {
    minTenths: LAP_TIME_AUDIO_MIN_TENTHS,
    maxTenths: LAP_TIME_AUDIO_MAX_TENTHS,
    defaultSpeed: LAP_TIME_AUDIO_DEFAULT_SPEED,
    voices: LAP_TIME_AUDIO_VOICES,
    entries,
  }
})
