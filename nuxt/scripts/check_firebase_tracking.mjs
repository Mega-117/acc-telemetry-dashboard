import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '../app')
const trackerFile = path.resolve(appRoot, 'composables/useFirebaseTracker.ts')
const monitoredNames = new Set([
  'addDoc',
  'deleteDoc',
  'getCountFromServer',
  'getDoc',
  'getDocs',
  'onSnapshot',
  'setDoc',
  'updateDoc',
  'writeBatch'
])

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const output = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      output.push(...walk(fullPath))
      continue
    }
    if (/\.(ts|vue)$/.test(entry.name)) {
      output.push(fullPath)
    }
  }
  return output
}

function extractFirestoreImports(content) {
  const matches = [...content.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]firebase\/firestore['"]/g)]
  const imports = []
  for (const match of matches) {
    const names = match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(/\s+as\s+/i)[0].trim())
    imports.push(...names)
  }
  return imports
}

const offenders = []

for (const file of walk(appRoot)) {
  if (path.resolve(file) === trackerFile) continue
  const content = fs.readFileSync(file, 'utf8')
  const imports = extractFirestoreImports(content)
  const forbidden = imports.filter((name) => monitoredNames.has(name))
  if (forbidden.length > 0) {
    offenders.push({
      file: path.relative(path.resolve(scriptDir, '..'), file).replace(/\\/g, '/'),
      imports: forbidden
    })
  }
}

if (offenders.length > 0) {
  console.error('[FIREBASE_TRACKING_CHECK] FAILED')
  for (const offender of offenders) {
    console.error(` - ${offender.file}: ${offender.imports.join(', ')}`)
  }
  process.exit(1)
}

console.log('[FIREBASE_TRACKING_CHECK] OK')
