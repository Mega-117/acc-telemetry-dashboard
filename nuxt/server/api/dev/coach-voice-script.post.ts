import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateCoachVoiceScriptUpdate } from '../../utils/coachVoiceScriptValidate'

// Salva il copione frasi coach (PIP-259): chiavi = contratto col motore
// (nessuna aggiunta/rimozione), ogni testo >=3 parole (regola Kokoro).
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const path = join(process.cwd(), 'app', 'config', 'coachVoiceScript.json')
  const existing = JSON.parse(await readFile(path, 'utf8'))
  const body = await readBody(event)
  const result = validateCoachVoiceScriptUpdate(existing, body)
  if (!result.ok || !result.normalized) {
    throw createError({ statusCode: 400, statusMessage: result.errors.join(' | ') })
  }
  await writeFile(path, JSON.stringify(result.normalized, null, 2) + '\n', 'utf8')
  return { ok: true }
})
