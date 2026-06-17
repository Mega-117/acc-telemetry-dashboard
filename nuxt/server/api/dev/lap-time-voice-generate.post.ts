import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  LAP_TIME_AUDIO_DEFAULT_SPEED,
  buildLapTimeVoiceEntry,
  isLapTimeAudioVoice,
  isLapTimeVoiceTenthsInRange,
  type LapTimeAudioVoice,
} from '../../../app/services/overlay/lapTimeAnnouncer'

const KOKORO_URL = 'http://localhost:5111'
const MAX_BATCH = 20

async function exists(filename: string): Promise<boolean> {
  try {
    await stat(join(process.cwd(), 'public', 'voice', 'qualifying', filename))
    return true
  } catch {
    return false
  }
}

async function synthesize(text: string, voice: LapTimeAudioVoice, speed: number): Promise<Buffer> {
  const url = `${KOKORO_URL}/speak?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${encodeURIComponent(String(speed))}`
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} ${body.slice(0, 120)}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 1000 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw new Error('Kokoro non ha restituito un WAV valido')
  }
  return buffer
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const body = await readBody(event)
  const voiceRaw = String(body?.voice || '').trim()
  if (!isLapTimeAudioVoice(voiceRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'Voce non valida' })
  }
  const voice = voiceRaw
  const speed = Number(body?.speed || LAP_TIME_AUDIO_DEFAULT_SPEED)
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw createError({ statusCode: 400, statusMessage: 'Velocita non valida' })
  }

  const force = Boolean(body?.force)
  const singleTenths = body?.tenths === undefined ? null : Number(body.tenths)
  const fromTenths = singleTenths ?? Number(body?.fromTenths)
  const toTenths = singleTenths ?? Number(body?.toTenths)
  if (!Number.isInteger(fromTenths) || !Number.isInteger(toTenths) || fromTenths > toTenths) {
    throw createError({ statusCode: 400, statusMessage: 'Range non valido' })
  }
  if (!isLapTimeVoiceTenthsInRange(fromTenths) || !isLapTimeVoiceTenthsInRange(toTenths)) {
    throw createError({ statusCode: 400, statusMessage: 'Range fuori dai tempi supportati' })
  }

  const count = toTenths - fromTenths + 1
  if (count > MAX_BATCH) {
    throw createError({ statusCode: 400, statusMessage: `Batch troppo grande: massimo ${MAX_BATCH} tracce per richiesta` })
  }

  const outDir = join(process.cwd(), 'public', 'voice', 'qualifying')
  await mkdir(outDir, { recursive: true })

  const results = []
  for (let tenths = fromTenths; tenths <= toTenths; tenths += 1) {
    const entry = buildLapTimeVoiceEntry(tenths, voice, speed)
    const path = join(outDir, entry.filename)
    if (!force && await exists(entry.filename)) {
      results.push({ ...entry, status: 'skipped' })
      continue
    }
    try {
      const buffer = await synthesize(entry.text, voice, speed)
      await writeFile(path, buffer)
      results.push({ ...entry, status: 'generated', bytes: buffer.length })
    } catch (error: any) {
      results.push({ ...entry, status: 'error', message: error?.message || 'errore' })
    }
  }

  const errors = results.filter(row => row.status === 'error')
  if (errors.length) {
    throw createError({
      statusCode: 502,
      statusMessage: `Generazione fallita per ${errors.length}/${results.length} tracce`,
      data: { results },
    })
  }

  return { ok: true, generated: results.filter(row => row.status === 'generated').length, results }
})
