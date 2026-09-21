import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Ogni lettura/scrittura Firebase deve passare da un unico punto osservato:
// Firestore da useFirebaseTracker, Realtime Database dal transport Pitwall
// (PIP-435). Un import diretto fuori da questi file sfugge al journal dev.
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '../app')

export const OWNERS = {
  'firebase/firestore': 'composables/useFirebaseTracker.ts',
  'firebase/database': 'services/pitwall/pitwallRealtimeTransport.ts'
}

export const MONITORED = {
  'firebase/firestore': new Set([
    'addDoc', 'deleteDoc', 'getCountFromServer', 'getAggregateFromServer', 'getDoc', 'getDocs',
    'getDocFromServer', 'getDocsFromServer', 'getDocFromCache', 'getDocsFromCache', 'loadBundle',
    'onSnapshot', 'onSnapshotsInSync', 'runTransaction', 'setDoc', 'updateDoc', 'writeBatch'
  ]),
  'firebase/database': new Set([
    'get', 'set', 'update', 'push', 'remove', 'runTransaction', 'onValue', 'onChildAdded',
    'onChildChanged', 'onChildMoved', 'onChildRemoved', 'onDisconnect', 'setWithPriority', 'setPriority'
  ])
}

export function findForbiddenImports(relativeAppPath, content) {
  const normalized = relativeAppPath.replace(/\\/g, '/')
  const forbidden = []
  for (const [module, names] of Object.entries(MONITORED)) {
    if (normalized === OWNERS[module]) continue
    const escaped = module.replace('/', '\\/')
    const pattern = new RegExp(`import\\s*(type\\s*)?\\{([^}]+)\\}\\s*from\\s*['"]${escaped}['"]`, 'g')
    for (const match of content.matchAll(pattern)) {
      if (match[1]) continue
      const imported = match[2].split(',').map(part => part.trim()).filter(Boolean)
        .filter(part => !part.startsWith('type '))
        .map(part => part.split(/\s+as\s+/i)[0].trim())
      forbidden.push(...imported.filter(name => names.has(name)).map(name => `${module}:${name}`))
    }
    if (new RegExp(`import\\s*\\*\\s*as\\s+\\w+\\s*from\\s*['"]${escaped}['"]`).test(content)) {
      forbidden.push(`${module}:*`)
    }
  }
  return forbidden
}

function walk(dir) {
  const output = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) output.push(...walk(fullPath))
    else if (/\.(ts|vue)$/.test(entry.name)) output.push(fullPath)
  }
  return output
}

export function checkAppTree(root = appRoot) {
  const offenders = []
  for (const file of walk(root)) {
    const forbidden = findForbiddenImports(path.relative(root, file), fs.readFileSync(file, 'utf8'))
    if (forbidden.length) offenders.push({ file: path.relative(root, file).replace(/\\/g, '/'), imports: forbidden })
  }
  return offenders
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const offenders = checkAppTree()
  if (offenders.length > 0) {
    console.error('[FIREBASE_TRACKING_CHECK] FAILED')
    for (const offender of offenders) console.error(` - app/${offender.file}: ${offender.imports.join(', ')}`)
    process.exit(1)
  }
  console.log('[FIREBASE_TRACKING_CHECK] OK')
}
