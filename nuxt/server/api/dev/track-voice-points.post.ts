import { readVoicePoints, writeVoicePoints } from '../../utils/devVoicePoints'

const SAFE_VOICE_IDS = new Set(['if_sara', 'im_nicola'])

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 280)
}

const REFERENCE_SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const

function cleanSpeed(value: unknown) {
  const speed = Number(value)
  if (!Number.isFinite(speed)) return undefined
  return REFERENCE_SPEED_OPTIONS.reduce((nearest, option) =>
    Math.abs(option - speed) < Math.abs(nearest - speed) ? option : nearest
  )
}

// Stessi limiti di TRACK_VOICE_TIMING_OFFSET_MIN/MAX_SEC in
// app/services/spotter/trackVoiceReferences.ts (PIP-217).
function cleanTimingOffsetSec(value: unknown) {
  const offset = Math.round(Number(value) || 0)
  return Math.max(-10, Math.min(10, offset))
}

function cleanAudioPaths(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const cleaned: Record<string, string> = {}
  for (const [voice, path] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_VOICE_IDS.has(voice)) continue
    const safePath = cleanText(path)
    if (safePath) cleaned[voice] = safePath
  }
  return cleaned
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const body = await readBody(event)
  const updates = Array.isArray(body?.points) ? body.points : []
  if (!updates.length) {
    throw createError({ statusCode: 400, statusMessage: 'Nessun riferimento da salvare' })
  }

  const store = await readVoicePoints()
  const byId = new Map(updates.map((point: any) => [String(point?.id || ''), point]))
  let updated = 0

  store.points = store.points.map(point => {
    const update: any = byId.get(point.id)
    if (!update) return point
    updated += 1
    const next = { ...point }
    next.label = cleanText(update.label, point.label)
    next.text = cleanText(update.text, point.text)

    const incomingPaths = cleanAudioPaths(update.audio_paths)
    const mergedPaths = { ...(point.audio_paths || {}) }
    if (point.audio_path && SAFE_VOICE_IDS.has(point.audio_voice || '')) {
      mergedPaths[point.audio_voice!] = point.audio_path
    }
    if (incomingPaths) {
      for (const voice of SAFE_VOICE_IDS) {
        if (incomingPaths[voice]) mergedPaths[voice] = incomingPaths[voice]
        else if (update.audio_paths && Object.prototype.hasOwnProperty.call(update.audio_paths, voice)) delete mergedPaths[voice]
      }
    }

    const voice = cleanText(update.audio_voice, point.audio_voice)
    const audioPath = cleanText(update.audio_path, point.audio_path)
    if (SAFE_VOICE_IDS.has(voice)) {
      next.audio_voice = voice
      next.audio_path = audioPath
      if (audioPath) mergedPaths[voice] = audioPath
      else if (Object.prototype.hasOwnProperty.call(update, 'audio_path')) delete mergedPaths[voice]
    }

    next.audio_paths = mergedPaths
    const speed = cleanSpeed(update.speed)
    if (speed !== undefined) next.speed = speed
    if (typeof update.enabled === 'boolean') next.enabled = update.enabled
    if (Object.prototype.hasOwnProperty.call(update, 'timing_offset_sec')) next.timing_offset_sec = cleanTimingOffsetSec(update.timing_offset_sec)
    return next
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Riferimenti non trovati' })
  }

  await writeVoicePoints(store)
  return { ok: true, updated, points: store.points }
})
