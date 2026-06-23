import { readVoicePoints, writeVoicePoints } from '../../utils/devVoicePoints'

const SAFE_VOICE_IDS = new Set(['if_sara', 'im_nicola'])

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 280)
}

function cleanSpeed(value: unknown) {
  const speed = Number(value)
  if (!Number.isFinite(speed)) return undefined
  return Math.max(0.5, Math.min(2, speed))
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
    next.audio_path = cleanText(update.audio_path, point.audio_path)
    const voice = cleanText(update.audio_voice, point.audio_voice)
    if (SAFE_VOICE_IDS.has(voice)) next.audio_voice = voice
    const speed = cleanSpeed(update.speed)
    if (speed !== undefined) next.speed = speed
    if (typeof update.enabled === 'boolean') next.enabled = update.enabled
    return next
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Riferimenti non trovati' })
  }

  await writeVoicePoints(store)
  return { ok: true, updated, points: store.points }
})
