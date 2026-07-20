import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Legge il copione frasi coach (PIP-259). Solo dev, come il copione step.
export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const path = join(process.cwd(), 'app', 'config', 'coachVoiceScript.json')
  return JSON.parse(await readFile(path, 'utf8'))
})
