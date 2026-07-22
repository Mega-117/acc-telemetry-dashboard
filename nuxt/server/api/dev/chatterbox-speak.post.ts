import { CHATTERBOX_URL } from '../../utils/chatterboxRuntimeStatus'
import { CHATTERBOX_DEFAULT_VOICE_ID, resolveChatterboxVoicePrompt } from '../../utils/chatterboxVoiceCatalog'
import { resolveChatterboxProsody } from '#shared/chatterboxProsody'

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody(event)
  const text = String(body?.text || '').trim()
  const voice = String(body?.voice || CHATTERBOX_DEFAULT_VOICE_ID).trim()
  const prosody = resolveChatterboxProsody(body)
  if (!prosody) throw createError({ statusCode: 400, statusMessage: 'Parametri di tonalità non validi' })
  if (!text) throw createError({ statusCode: 400, statusMessage: 'Testo mancante' })
  if (text.length > 600) throw createError({ statusCode: 400, statusMessage: 'Testo troppo lungo: massimo 600 caratteri' })

  const prompt = resolveChatterboxVoicePrompt(voice)
  if (prompt === undefined) throw createError({ statusCode: 400, statusMessage: 'Voce non valida o campione non più disponibile' })

  let response: Response
  try {
    response = await fetch(`${CHATTERBOX_URL}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, ...prosody }),
      signal: AbortSignal.timeout(180_000),
    })
  } catch (error: any) {
    throw createError({ statusCode: 503, statusMessage: `Chatterbox non raggiungibile: ${error?.message || 'errore'}` })
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw createError({ statusCode: 502, statusMessage: data?.error || `Chatterbox speak fallito: HTTP ${response.status}` })
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 1000 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw createError({ statusCode: 502, statusMessage: 'Chatterbox non ha restituito un WAV valido' })
  }
  setHeader(event, 'Content-Type', 'audio/wav')
  setHeader(event, 'Content-Length', buffer.length)
  return buffer
})
