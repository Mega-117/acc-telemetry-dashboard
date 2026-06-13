import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Salva un WAV rigenerato dal voice lab (PIP-100): il lab sintetizza via
// Kokoro (localhost:5111) e posta qui il blob; il file sovrascrive il WAV
// deterministico che l'overlay riproduce.
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
  const path = join(process.cwd(), 'public', 'voice', 'qualifying', filename)
  await writeFile(path, buffer)
  return { ok: true, bytes: buffer.length }
})
