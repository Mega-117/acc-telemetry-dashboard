const KOKORO_URL = 'http://localhost:5111'
const SAFE_VOICE = /^[a-z]{2}_[a-z0-9_]+$/i

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const query = getQuery(event)
  const text = String(query.text || '').trim()
  const voice = String(query.voice || 'if_sara').trim()
  const speed = Number(query.speed || 1)

  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Testo mancante' })
  }
  if (!SAFE_VOICE.test(voice)) {
    throw createError({ statusCode: 400, statusMessage: 'Voce non valida' })
  }
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw createError({ statusCode: 400, statusMessage: 'Velocita non valida' })
  }

  const url = `${KOKORO_URL}/speak?text=${encodeURIComponent(text.slice(0, 600))}&voice=${encodeURIComponent(voice)}&speed=${encodeURIComponent(String(speed))}`
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw createError({ statusCode: 502, statusMessage: `Kokoro speak fallito: HTTP ${response.status} ${body.slice(0, 120)}` })
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 1000 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw createError({ statusCode: 502, statusMessage: 'Kokoro non ha restituito un WAV valido' })
  }

  setHeader(event, 'Content-Type', 'audio/wav')
  setHeader(event, 'Content-Length', buffer.length)
  return buffer
})
