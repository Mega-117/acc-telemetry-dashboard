import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+\.wav$/

function slug(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const body = await readBody(event)
  const trackSlug = slug(body?.track)
  const filename = String(body?.filename || '')
  const dataBase64 = String(body?.dataBase64 || '')
  if (!trackSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Pista non valida' })
  }
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

  const outDir = join(process.cwd(), 'public', 'voice', 'references', trackSlug)
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, filename), buffer)
  return { ok: true, bytes: buffer.length, path: `/voice/references/${trackSlug}/${filename}` }
})
