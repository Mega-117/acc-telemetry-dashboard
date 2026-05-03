import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'
import crypto from 'node:crypto'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

function resolveFileCandidate(candidatePath) {
  const directCandidates = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.js`,
    `${candidatePath}.mjs`,
    `${candidatePath}.json`
  ]

  for (const directCandidate of directCandidates) {
    if (fs.existsSync(directCandidate) && fs.statSync(directCandidate).isFile()) {
      return directCandidate
    }
  }

  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
    for (const indexCandidate of ['index.ts', 'index.js', 'index.mjs', 'index.json']) {
      const fullPath = path.join(candidatePath, indexCandidate)
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath
      }
    }
  }

  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('~/') || specifier.startsWith('@/')) {
      const localSpecifier = specifier.slice(2)
      const rootFolder = specifier.startsWith('~/') ? 'app' : ''
      const candidatePath = path.join(nuxtRoot, rootFolder, localSpecifier)
      const resolved = resolveFileCandidate(candidatePath)
      if (resolved) {
        return {
          shortCircuit: true,
          url: pathToFileURL(resolved).href
        }
      }
    }

    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
      const parentPath = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : nuxtRoot
      const candidatePath = path.resolve(parentPath, specifier)
      const resolved = resolveFileCandidate(candidatePath)
      if (resolved) {
        return {
          shortCircuit: true,
          url: pathToFileURL(resolved).href
        }
      }
    }

    return nextResolve(specifier, context)
  }
})

const { createSyncScanService } = await import('../app/services/sync/syncScanService.ts')
const { createSyncQueueService } = await import('../app/services/sync/syncQueueService.ts')
const { resolveSyncTriggerAction } = await import('../app/services/sync/syncTriggerPolicy.ts')

const autoSyncSource = fs.readFileSync(path.join(nuxtRoot, 'app/services/sync/autoSyncController.ts'), 'utf8')
const electronSyncSource = fs.readFileSync(path.join(nuxtRoot, 'app/composables/useElectronSync.ts'), 'utf8')
assert.match(autoSyncSource, /WINDOW_FOCUS_SYNC_THROTTLE_MS/, 'window focus auto-sync must be throttled')
assert.match(electronSyncSource, /FULL_AUTO_SCAN_DEDUPE_MS/, 'initial full auto scans must be deduplicated')

function hashText(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

const triggerExpectations = {
  filesChanged: { scanMode: 'changed', processPending: true, runMaintenance: false, interactive: false },
  windowFocused: { scanMode: 'none', processPending: false, runMaintenance: false, interactive: false },
  initialFiles: { scanMode: 'none', processPending: false, runMaintenance: false, interactive: false },
  authReady: { scanMode: 'full', processPending: true, runMaintenance: true, interactive: false },
  manualForceSync: { scanMode: 'full', processPending: true, runMaintenance: true, interactive: true }
}

for (const [trigger, expected] of Object.entries(triggerExpectations)) {
  const action = resolveSyncTriggerAction(trigger)
  assert.deepEqual(action, { trigger, ...expected })
}

const validPending = {
  session_info: {
    date_start: '2026-04-24T12:00:00',
    track: 'cota',
    car: 'ferrari_296_gt3',
    session_type: 0,
    laps_total: 5,
    laps_valid: 5,
    total_drive_time_ms: 360000
  },
  ownerId: 'owner-1'
}

const validUnchanged = {
  session_info: {
    date_start: '2026-04-23T18:00:00',
    track: 'monza',
    car: 'ferrari_296_gt3',
    session_type: 1,
    laps_total: 4,
    laps_valid: 4,
    total_drive_time_ms: 240000
  },
  ownerId: 'owner-1'
}

const zeroLaps = {
  session_info: {
    date_start: '2026-04-22T10:00:00',
    track: 'silverstone',
    car: 'ferrari_296_gt3',
    session_type: 0,
    laps_total: 0,
    laps_valid: 0,
    total_drive_time_ms: 0
  },
  ownerId: 'owner-1'
}

const ownerMismatch = {
  session_info: {
    date_start: '2026-04-21T10:00:00',
    track: 'spa',
    car: 'ferrari_296_gt3',
    session_type: 0,
    laps_total: 4,
    laps_valid: 4,
    total_drive_time_ms: 240000
  },
  ownerId: 'owner-2'
}

const rawByPath = {
  'pending.json': validPending,
  'unchanged.json': validUnchanged,
  'zero.json': zeroLaps,
  'mismatch.json': ownerMismatch,
  'invalid.txt': { foo: 'bar' }
}

const unchangedText = JSON.stringify(validUnchanged)
const readFileCalls = []
const scanService = createSyncScanService({
  electronAPI: {
    getTelemetryFiles: async () => ([
      { name: 'pending.json', path: 'pending.json', mtime: 1, size: 10 },
      { name: 'unchanged.json', path: 'unchanged.json', mtime: 2, size: 10 },
      { name: 'zero.json', path: 'zero.json', mtime: 3, size: 10 },
      { name: 'mismatch.json', path: 'mismatch.json', mtime: 4, size: 10 },
      { name: 'invalid.txt', path: 'invalid.txt', mtime: 5, size: 10 }
    ]),
    readFile: async (filePath) => {
      readFileCalls.push(filePath)
      return rawByPath[filePath]
    }
  },
  loadRegistryCache: async () => ({
    'unchanged.json': {
      uploadedBy: 'owner-1',
      fileHash: hashText(unchangedText),
      sessionId: '2026_04_23T18_00_00_monza',
      uploadedAt: '2026-04-23T19:00:00Z',
      mtime: 2,
      size: 10,
      bestRulesVersion: 999
    }
  }),
  calculateContentHash: async (input) => hashText(input)
})

const scanResult = await scanService.scanPendingFiles({ ownerId: 'owner-1' })
assert.equal(scanResult.pendingFiles.length, 1)
assert.equal(scanResult.pendingFiles[0]?.fileName, 'pending.json')
assert.equal(scanResult.unchangedFiles.length, 1)
assert.equal(scanResult.unchangedFiles[0]?.fileName, 'unchanged.json')
assert.equal(readFileCalls.includes('unchanged.json'), false, 'unchanged registry hit must not read file content')
assert.deepEqual(
  scanResult.skippedFiles.map((item) => [item.fileName, item.reason]),
  [
    ['zero.json', 'zero_laps'],
    ['mismatch.json', 'owner_mismatch'],
    ['invalid.txt', 'invalid_file']
  ]
)

const statusTransitions = []
const queueService = createSyncQueueService({
  onStatusChange: (status) => statusTransitions.push(status)
})

queueService.enqueue([
  scanResult.pendingFiles[0],
  scanResult.pendingFiles[0]
].filter(Boolean))
assert.equal(queueService.size(), 1)

const drainResult = await queueService.drain(async (item) => ({
  result: { status: 'created', fileName: item.fileName, sessionId: item.sessionId },
  didChange: true,
  dirtySessionId: item.sessionId,
  dirtyTrack: item.rawObj.session_info.track
}))

assert.equal(drainResult.changedCount, 1)
assert.deepEqual(drainResult.dirtyTracks, ['cota'])
assert.deepEqual(statusTransitions, ['queued', 'uploading', 'idle'])

console.log('[SYNC_RUNTIME_CHECK] OK')
