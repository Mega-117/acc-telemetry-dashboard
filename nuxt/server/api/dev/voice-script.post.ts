import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeVoiceScript } from '../../utils/voiceScriptNormalize'

// Scrive il copione (PIP-100). Validazione minima di forma: il contenuto
// resta versionato in git, ogni modifica e' visibile nel diff e reversibile.
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || !Array.isArray(body.steps) || !Array.isArray(body.scenarios)) {
    throw createError({ statusCode: 400, statusMessage: 'Copione non valido: servono steps[] e scenarios[]' })
  }
  for (const s of body.steps) {
    if (!s.trainingId || !s.modeId || !s.stepId || typeof s.text !== 'string' || !s.text.trim()) {
      throw createError({ statusCode: 400, statusMessage: `Step non valido: ${JSON.stringify(s).slice(0, 80)}` })
    }
  }
  for (const s of body.scenarios) {
    if (!s.id || typeof s.text !== 'string' || !s.text.trim()) {
      throw createError({ statusCode: 400, statusMessage: `Scenario non valido: ${JSON.stringify(s).slice(0, 80)}` })
    }
  }
  // PIP-138: blinda il contratto "testi TTS minuscoli" al salvataggio (punto
  // unico: copre UI, API e edit manuali). Logica pura in server/utils, testata.
  normalizeVoiceScript(body)
  const path = join(process.cwd(), 'app', 'config', 'voiceScript.json')
  await writeFile(path, JSON.stringify(body, null, 2) + '\n', 'utf8')
  return { ok: true }
})
