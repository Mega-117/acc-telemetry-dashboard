import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Endpoint dev-only del voice lab (PIP-100): legge il copione fresco da disco
// (l'import statico non vedrebbe le scritture fatte dal lab stesso).
// In produzione il frontend e' una build statica senza Nitro: questi endpoint
// non esistono; il guard sotto e' una cintura in piu'.
export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const path = join(process.cwd(), 'app', 'config', 'voiceScript.json')
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
})
