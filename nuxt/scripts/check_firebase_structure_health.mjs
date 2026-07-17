import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = {
  service: fs.readFileSync(path.join(root, 'app/services/sync/firebaseStructureHealthService.ts'), 'utf8'),
  gate: fs.readFileSync(path.join(root, 'app/services/sync/ownerDataMaintenanceService.ts'), 'utf8'),
  repository: fs.readFileSync(path.join(root, 'app/repositories/pilotDirectoryRepository.ts'), 'utf8'),
  admin: fs.readFileSync(path.join(root, 'app/pages/piloti/index.vue'), 'utf8')
}

const requirements = [
  [files.service, 'trackedRunTransaction', 'lease atomico tracciato'],
  [files.service, 'future_schema', 'protezione schema futuro'],
  [files.service, 'FIREBASE_STRUCTURE_HEALTH_TTL_MS', 'TTL health check'],
  [files.gate, 'verify_current', 'verifica leggera struttura corrente'],
  [files.gate, 'publishHealthOutcome', 'pubblicazione esito health'],
  [files.gate, 'lightweightVerificationFailed', 'rebuild dopo verifica leggera fallita'],
  [files.repository, 'firebaseHealthStatus', 'proiezione directory admin'],
  [files.admin, 'Firebase bloccato', 'stato health visibile admin']
]

const missing = requirements.filter(([content, token]) => !content.includes(token))
if (missing.length > 0) {
  console.error('[FIREBASE_STRUCTURE_HEALTH_CHECK] FAILED')
  for (const [, , label] of missing) console.error(` - missing: ${label}`)
  process.exit(1)
}

console.log('[FIREBASE_STRUCTURE_HEALTH_CHECK] OK')