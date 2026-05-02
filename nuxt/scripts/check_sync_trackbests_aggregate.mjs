import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

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

const sessionUploadSource = fs.readFileSync(path.join(nuxtRoot, 'app/services/sync/sessionUploadService.ts'), 'utf8')
const electronSyncSource = fs.readFileSync(path.join(nuxtRoot, 'app/composables/useElectronSync.ts'), 'utf8')
const projectionRefreshSource = fs.readFileSync(path.join(nuxtRoot, 'app/services/sync/syncProjectionRefreshService.ts'), 'utf8')

assert.equal(sessionUploadSource.includes('updateTrackBests:'), false, 'session upload service must not receive a per-file trackBests updater')
assert.equal(sessionUploadSource.includes('await updateTrackBests'), false, 'session upload service must not write trackBests per file')
assert.equal(electronSyncSource.includes('updateTrackBestsProjection'), false, 'normal sync must not call updateTrackBestsProjection per file')
assert.equal(projectionRefreshSource.includes('applyTrackBestsProjectionDeltas'), true, 'projection refresh must apply aggregated trackBests deltas')
assert.equal(projectionRefreshSource.includes('applyUserProjectionDeltas'), true, 'projection refresh must apply incremental user projection deltas')
assert.ok(
  projectionRefreshSource.indexOf('applyUserProjectionDeltas') < projectionRefreshSource.indexOf("sourceMode: 'cloud_fresh'"),
  'normal incremental projection path must run before any cloud_fresh fallback'
)

const { applyTrackBestsProjectionDeltas } = await import('../app/services/sync/trackBestsProjectionService.ts')
const { applyUserProjectionDeltas } = await import('../app/services/sync/syncUserProjectionDeltaService.ts')

function makeDelta(index, trackId = 'monza') {
  return {
    trackId,
    sessionId: `${trackId}-session-${index}`,
    dateStart: `2026-04-${String(index + 1).padStart(2, '0')}T12:00:00`,
    car: 'ferrari_296_gt3',
    summary: {
      best_rules_version: 2,
      laps: 5,
      lapsValid: 4,
      totalTime: 300000,
      best_by_grip: {
        Optimum: {
          bestRace: 100000 - index,
          bestRaceTemp: 24,
          bestRaceFuel: 42
        }
      }
    }
  }
}

let getCalls = 0
let setCalls = 0
const writes = []

const result = await applyTrackBestsProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: Array.from({ length: 10 }, (_, index) => makeDelta(index)),
  getDocFn: async () => {
    getCalls++
    return {
      exists: () => false,
      data: () => null
    }
  },
  setDocFn: async (ref, data) => {
    setCalls++
    writes.push({ ref, data })
  },
  bestRulesVersion: 2,
  docFn: (_db, docPath) => ({ path: docPath })
})

assert.deepEqual(result.touchedTracks, ['monza'])
assert.deepEqual(result.updatedTracks, ['monza'])
assert.equal(getCalls, 1)
assert.equal(setCalls, 1)
assert.equal(writes[0].data.activity.sessionCount, 10)
assert.equal(writes[0].data.activity.totalLaps, 50)
assert.equal(writes[0].data.bests.GT3.Optimum.bestRace, 99991)

getCalls = 0
setCalls = 0
await applyTrackBestsProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: [
    makeDelta(1, 'monza'),
    makeDelta(2, 'spa'),
    makeDelta(3, 'silverstone'),
    makeDelta(4, 'spa')
  ],
  getDocFn: async () => {
    getCalls++
    return {
      exists: () => false,
      data: () => null
    }
  },
  setDocFn: async () => {
    setCalls++
  },
  bestRulesVersion: 2,
  docFn: (_db, docPath) => ({ path: docPath })
})

assert.equal(getCalls, 3)
assert.equal(setCalls, 3)

getCalls = 0
setCalls = 0
const userWrites = []
const userProjectionResult = await applyUserProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: Array.from({ length: 10 }, (_, index) => ({
    ...makeDelta(index, 'monza'),
    status: 'created',
    sessionType: index % 3
  })),
  getDocFn: async () => {
    getCalls++
    return {
      exists: () => true,
      data: () => ({
        stats: { totalSessions: 2 },
        sessionIndex: {
          totalSessions: 2,
          sessionsList: [
            {
              id: 'existing-session',
              date: '2026-04-01T12:00:00',
              track: 'spa',
              car: 'ferrari_296_gt3',
              type: 0,
              laps: 3,
              lapsValid: 3,
              bestLap: null,
              totalTime: 180000,
              stintCount: 1,
              bestQualyMs: null,
              bestSessionRaceMs: null,
              bestRaceMs: null,
              bestRulesVersion: 2,
              grip: null,
              bestSessionRaceGrip: null
            }
          ],
          tracksSummary: [{ track: 'spa', sessions: 1, lastPlayed: '2026-04-01T12:00:00' }]
        }
      })
    }
  },
  setDocFn: async (ref, data) => {
    setCalls++
    userWrites.push({ ref, data })
  },
  docFn: (_db, docPath) => ({ path: docPath })
})

assert.equal(userProjectionResult.wrote, true)
assert.equal(getCalls, 1, 'incremental user projection must read only the user projection document')
assert.equal(setCalls, 2, 'incremental user projection must write user projection and pilotDirectory once')
assert.equal(userWrites[0].ref.path, 'users/user-1')
assert.equal(userWrites[1].ref.path, 'pilotDirectory/user-1')
assert.equal(userWrites[0].data.sessionIndex.totalSessions, 12)
assert.equal(userWrites[0].data.sessionIndex.sessionsList.length, 11)

console.log('[SYNC_TRACKBESTS_AGGREGATE] OK')
