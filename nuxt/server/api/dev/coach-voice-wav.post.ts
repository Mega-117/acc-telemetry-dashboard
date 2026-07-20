import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Salva un WAV coach rigenerato dal Voice Lab (PIP-259): stesso flusso di
// voice-wav.post (il lab sintetizza via Kokoro e posta qui il blob).
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+\.wav$/

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const body = await readBody(event)
  const filename = String(body?.filename || '')
  const dataBase64 = String(body?.dataBase64 || '')
  if (!SAFE_FILENAME.test(filename) || filename.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Nome file non valido' })
  }
  if (!dataBase64) {
    throw createError({ statusCode: 400, statusMessage: 'Audio mancante' })
  }
  const buffer = Buffer.from(dataBase64, 'base64')
  if (buffer.length < 1000 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw createError({ statusCode: 400, statusMessage: 'Il contenuto non sembra un WAV valido' })
  }
  const dir = join(process.cwd(), 'public', 'voice', 'coach')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), buffer)
  return { ok: true, bytes: buffer.length }
})
