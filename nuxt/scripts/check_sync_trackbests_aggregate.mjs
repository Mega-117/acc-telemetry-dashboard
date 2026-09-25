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
const trackBestsSource = fs.readFileSync(path.join(nuxtRoot, 'app/services/sync/trackBestsProjectionService.ts'), 'utf8')

assert.equal(sessionUploadSource.includes('updateTrackBests:'), false, 'session upload service must not receive a per-file trackBests updater')
assert.equal(sessionUploadSource.includes('await updateTrackBests'), false, 'session upload service must not write trackBests per file')
assert.equal(electronSyncSource.includes('updateTrackBestsProjection'), false, 'normal sync must not call updateTrackBestsProjection per file')
assert.equal(projectionRefreshSource.includes('applyTrackBestsProjectionDeltas'), true, 'projection refresh must apply aggregated trackBests deltas')
assert.equal(projectionRefreshSource.includes('applyUserProjectionDeltas'), true, 'projection refresh must apply incremental user projection deltas')
assert.equal(trackBestsSource.includes('syncedSessionIds: Array.from(countedSessionIds).slice(-100)'), false, 'trackBests activity idempotency must not be capped to the last 100 sessions')
assert.ok(
  projectionRefreshSource.indexOf('applyUserProjectionDeltas') < projectionRefreshSource.indexOf('await loadFullHistory(uid)'),
  'normal incremental projection path must run before any full-history fallback'
)
// PIP-436: il ricalcolo su un sottoinsieme (caricatore UI limitato a 200) riscrive le proiezioni come
// se le sessioni piu' vecchie non esistessero.
assert.equal(projectionRefreshSource.includes('cloud_fresh'), false, 'projection rebuild must never use the capped cloud_fresh loader')

// PIP-444: nessuna rilettura prima del batch. Il piano legge dal mirror locale (stessa
// revisione owner), users/{uid} arriva dalla copia fresca del ciclo, `uploads/{hash}`
// non viene piu' scritto e il registro locale evita la rilettura di sessions/rawChunks.
assert.ok(projectionRefreshSource.includes('createSyncMirrorCycle'), 'projection refresh must read through the sync mirror cycle')
assert.ok(projectionRefreshSource.includes('combineProjectionWrites'), 'projection plan must combine writes to the same document')
assert.ok(projectionRefreshSource.includes('buildNextSyncMirror'), 'projection refresh must rebuild the mirror from the committed plan')
assert.equal(sessionUploadSource.includes('users/${uid}/uploads/'), false, 'session upload must not write the uploads/{fileHash} registry')
assert.ok(sessionUploadSource.includes('resolveKnownCloudSession'), 'session upload must reuse the cloud state known by the local registry')
assert.ok(sessionUploadSource.includes('knownRawChunkIds'), 'session upload must derive chunk ids from the registry instead of querying rawChunks')
assert.ok(electronSyncSource.includes('loadOwnerDocument(uid, { fresh: hasProjectionWork, caller: SYNC_CALLER })'), 'write cycles must read a fresh owner revision; unchanged-file scans reuse the committed/provisioned owner')
assert.equal((electronSyncSource.match(/loadOwnerDocument\(/g) || []).length, 1, 'sync cycle must have a single users/{uid} read site')
assert.ok(electronSyncSource.includes('publishSyncMirror('), 'sync cycle must publish the mirror after the commit')
assert.ok(electronSyncSource.includes('invalidateSyncMirror(uid)'), 'a failed cycle must invalidate the mirror')
// PIP-444 (b): un documento per pista, entrambe le sezioni via mergeFields.
assert.ok(trackBestsSource.includes('loadTrackProjectionSections'), 'trackBests must read the merged per-track document first')
assert.ok(trackBestsSource.includes("section: 'bests'"), 'trackBests must write the bests section of the merged document')
assert.equal(trackBestsSource.includes('users/${uid}/trackBests/${trackIdNorm}'), false, 'trackBests must no longer write the legacy per-track document')

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
  setDocFn: async (ref, data, options) => {
    setCalls++
    writes.push({ ref, data, options })
  },
  bestRulesVersion: 2,
  docFn: (_db, docPath) => ({ path: docPath })
})

assert.deepEqual(result.touchedTracks, ['monza'])
assert.deepEqual(result.updatedTracks, ['monza'])
// PIP-444: documento unito assente -> 1 lettura del documento unito + 1 del vecchio trackBests.
assert.equal(getCalls, 2, 'missing merged document: one merged read plus one legacy trackBests read')
assert.equal(setCalls, 1)
assert.equal(writes[0].ref.path, 'users/user-1/trackProjections/monza', 'bests must be written into the merged per-track document')
assert.deepEqual(writes[0].options, { mergeFields: ['schemaVersion', 'trackId', 'bests', 'updatedAt'] }, 'the bests section must replace itself whole')
assert.equal(writes[0].data.schemaVersion, 1)
assert.equal(writes[0].data.trackId, 'monza')
assert.equal(writes[0].data.bests.activity.sessionCount, 10)
assert.equal(writes[0].data.bests.activity.totalLaps, 50)
assert.equal(writes[0].data.bests.bests.GT3.Optimum.bestRace, 99991)
assert.equal(writes[0].data.bests.bests.GT3.Optimum.raceBestByFuelBucket['40-60'].timeMs, 99991)
assert.equal(writes[0].data.bests.bests.GT3.Optimum.raceBestByFuelBucket['20-40'], undefined)

getCalls = 0
setCalls = 0
writes.length = 0
await applyTrackBestsProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: [{
    trackId: 'monza',
    sessionId: 'monza-vnext',
    dateStart: '2026-05-17T15:00:00',
    car: 'ferrari_296_gt3',
    summary: {
      best_rules_version: 5,
      laps: 5,
      lapsValid: 5,
      totalTime: 500000,
      best_by_grip: {
        Optimum: {
          bestRace: 98000,
          bestRaceTemp: 22,
          bestRaceFuel: 72,
          bestAvgRace: 99000,
          bestAvgRaceTemp: 22,
          bestAvgRaceFuel: 80,
          raceBestByFuelBucket: {
            '40-60': {},
            '60-80': {
              timeMs: 98000,
              fuel: 72,
              airTemp: 22,
              roadTemp: 30,
              grip: 'Optimum',
              sampleLapCount: 1,
              confidence: 'high',
              source: 'best_lap'
            },
            '80-100': {},
            '100+': {}
          },
          raceAvgByFuelBucket: {
            '40-60': {},
            '60-80': {
              timeMs: 99000,
              fuel: 80,
              airTemp: 22,
              roadTemp: 30,
              grip: 'Optimum',
              sampleLapCount: 5,
              confidence: 'high',
              source: 'stint_avg'
            },
            '80-100': {},
            '100+': {}
          }
        }
      }
    }
  }],
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
  bestRulesVersion: 5,
  docFn: (_db, docPath) => ({ path: docPath })
})

assert.equal(getCalls, 2, 'missing merged document: one merged read plus one legacy trackBests read')
assert.equal(setCalls, 1)
assert.equal(writes[0].data.bests.version, 4)
assert.equal(writes[0].data.bests.bestRulesVersion, 5)
assert.equal(writes[0].data.bests.bests.GT3.Optimum.bestRace, 98000)
assert.equal(writes[0].data.bests.bests.GT3.Optimum.bestRaceSessionId, 'monza-vnext')
assert.equal(writes[0].data.bests.bests.GT3.Optimum.raceBestByFuelBucket['60-80'].timeMs, 98000)
assert.equal(writes[0].data.bests.bests.GT3.Optimum.raceAvgByFuelBucket['60-80'].sampleLapCount, 5)
assert.equal(writes[0].data.bests.bests.GT3.Optimum.raceBestByFuelBucket['20-40'], undefined)

getCalls = 0
setCalls = 0
writes.length = 0
await applyTrackBestsProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: Array.from({ length: 120 }, (_, index) => makeDelta(index, 'nurburgring')),
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

assert.equal(getCalls, 2, 'missing merged document: one merged read plus one legacy trackBests read')
assert.equal(setCalls, 1)
assert.equal(writes[0].data.bests.activity.sessionCount, 120)
assert.equal(writes[0].data.bests.activity.totalLaps, 600)
assert.equal(writes[0].data.bests.activity.validLaps, 480)
assert.equal(writes[0].data.bests.syncedSessionIds.length, 120, 'trackBests must retain all counted session ids for idempotent activity totals')

// Il documento unito appena scritto viene riletto come tale: una sola lettura per pista.
const existingTrackBestsWithManySessions = writes[0].data
getCalls = 0
setCalls = 0
writes.length = 0
await applyTrackBestsProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: [makeDelta(0, 'nurburgring')],
  getDocFn: async () => {
    getCalls++
    return {
      exists: () => true,
      data: () => existingTrackBestsWithManySessions
    }
  },
  setDocFn: async (ref, data) => {
    setCalls++
    writes.push({ ref, data })
  },
  bestRulesVersion: 2,
  docFn: (_db, docPath) => ({ path: docPath })
})

assert.equal(getCalls, 1, 'merged document present: exactly one read per track')
assert.equal(setCalls, 0, 'reprocessing an old session beyond the previous 100-id window must not rewrite or double count')

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

assert.equal(getCalls, 6, 'three tracks without merged document: merged + legacy read each')
assert.equal(setCalls, 3, 'one merged document per track')

getCalls = 0
setCalls = 0
const userReads = []
const userWrites = []
const userProjectionResult = await applyUserProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: Array.from({ length: 10 }, (_, index) => ({
    ...makeDelta(index, 'monza'),
    status: 'created',
    sessionType: index % 3
  })),
  getDocFn: async (ref) => {
    getCalls++
    userReads.push(ref.path)
    if (ref.path === 'users/user-1/sessionListMeta/v1') {
      return {
        exists: () => false,
        data: () => null
      }
    }
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
assert.deepEqual(
  userReads,
  ['users/user-1', 'users/user-1/sessionListMeta/v1'],
  'incremental user projection must read only the user projection document and session list metadata'
)
assert.equal(
  setCalls,
  2,
  'incremental user projection must write user projection and pilotDirectory once when session list projection is missing'
)
assert.equal(userWrites[0].ref.path, 'users/user-1')
assert.equal(userWrites[1].ref.path, 'pilotDirectory/user-1')
assert.equal(userWrites[0].data.sessionIndex.totalSessions, 12)
assert.equal(userWrites[0].data.sessionIndex.sessionsList.length, 11)

// PIP-441: la sync incrementale aggiunge al massimo UN documento (l'indice piste, merge
// delle sole piste cambiate) e nessuna lettura; il rebuild riscrive l'indice completo.
assert.ok(
  projectionRefreshSource.includes("indexMode: 'incremental'"),
  'incremental projection refresh must merge changed tracks into trackBestsIndex'
)
assert.ok(
  projectionRefreshSource.includes("indexMode: 'full'"),
  'full-history fallback must rewrite the complete trackBestsIndex'
)

getCalls = 0
setCalls = 0
writes.length = 0
const incremental = await applyTrackBestsProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: [makeDelta(1, 'monza'), makeDelta(2, 'spa')],
  getDocFn: async () => {
    getCalls++
    return { exists: () => false, data: () => null }
  },
  setDocFn: async (ref, data, options) => {
    setCalls++
    writes.push({ ref, data, options })
  },
  bestRulesVersion: 2,
  docFn: (_db, docPath) => ({ path: docPath }),
  indexMode: 'incremental',
  indexUpdatedAt: '2026-09-22T10:00:00.000Z'
})
assert.equal(incremental.indexWritten, true)
assert.equal(getCalls, 4, 'incremental index write must not read the index document (two tracks: merged + legacy read each)')
assert.equal(setCalls, 3, 'incremental sync writes the changed tracks plus exactly one index document')
const indexWrite = writes.find((write) => write.ref.path === 'users/user-1/trackBestsIndex/v1')
assert.ok(indexWrite, 'index write must target users/{uid}/trackBestsIndex/v1')
assert.deepEqual(indexWrite.options, { mergeFields: ['version', 'updatedAt', 'tracks.monza', 'tracks.spa'] }, 'changed entries must be replaced whole, never deep-merged')
assert.deepEqual(Object.keys(indexWrite.data.tracks).sort(), ['monza', 'spa'])
assert.equal(indexWrite.data.complete, undefined, 'incremental merge must not claim completeness')
assert.equal(indexWrite.data.tracks.monza.syncedSessionIds, undefined, 'index entries must not carry the session ledger')
assert.equal(indexWrite.data.tracks.monza.bests.GT3.Optimum.bestRace, 99999)

getCalls = 0
setCalls = 0
writes.length = 0
await applyTrackBestsProjectionDeltas({
  db: {},
  uid: 'user-1',
  deltas: [makeDelta(1, 'monza')],
  getDocFn: async () => {
    getCalls++
    return { exists: () => false, data: () => null }
  },
  setDocFn: async (ref, data, options) => {
    setCalls++
    writes.push({ ref, data, options })
  },
  bestRulesVersion: 2,
  docFn: (_db, docPath) => ({ path: docPath }),
  indexMode: 'full'
})
assert.equal(setCalls, 2)
const fullIndexWrite = writes.find((write) => write.ref.path === 'users/user-1/trackBestsIndex/v1')
assert.equal(fullIndexWrite.options, undefined, 'full rebuild must replace the index document')
assert.equal(fullIndexWrite.data.complete, true)
assert.deepEqual(Object.keys(fullIndexWrite.data.tracks), ['monza'])

console.log('[SYNC_TRACKBESTS_AGGREGATE] OK')
