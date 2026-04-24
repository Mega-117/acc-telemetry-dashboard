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

const { buildMergedSessionPage } = await import('../app/composables/useSessionPager.ts')

function makeSession({
  sessionId,
  track,
  date,
  source,
  syncState,
  bestLap
}) {
  return {
    sessionId,
    fileHash: '',
    fileName: `${sessionId}.json`,
    uploadedAt: null,
    meta: {
      track,
      car: 'ferrari_296_gt3',
      date_start: date,
      date_end: null,
      session_type: 0,
      driver: null
    },
    summary: {
      laps: 5,
      lapsValid: 5,
      bestLap,
      avgCleanLap: null,
      totalTime: 0,
      stintCount: 1
    },
    rawChunkCount: 0,
    rawSizeBytes: 0,
    source,
    syncState
  }
}

const localSessions = [
  makeSession({
    sessionId: '2026-04-22_monza',
    track: 'monza',
    date: '2026-04-22T18:00:00',
    source: 'local',
    syncState: 'synced',
    bestLap: 103000
  }),
  makeSession({
    sessionId: '2026-04-21_silverstone',
    track: 'silverstone',
    date: '2026-04-21T19:57:00',
    source: 'local',
    syncState: 'pending_sync',
    bestLap: 118900
  }),
  makeSession({
    sessionId: '2026-04-19_spa',
    track: 'spa',
    date: '2026-04-19T16:30:00',
    source: 'local',
    syncState: 'pending_sync',
    bestLap: 132500
  })
]

const cloudSessions = [
  makeSession({
    sessionId: '2026-04-23_cota',
    track: 'cota',
    date: '2026-04-23T21:00:00',
    source: 'cloud',
    syncState: 'synced',
    bestLap: 101200
  }),
  makeSession({
    sessionId: '2026-04-22_monza',
    track: 'monza',
    date: '2026-04-22T18:00:00',
    source: 'cloud',
    syncState: 'synced',
    bestLap: 103180
  }),
  makeSession({
    sessionId: '2026-04-20_watkins',
    track: 'watkins_glen',
    date: '2026-04-20T18:40:00',
    source: 'cloud',
    syncState: 'synced',
    bestLap: 103700
  }),
  makeSession({
    sessionId: '2026-04-18_paul_ricard',
    track: 'paul_ricard',
    date: '2026-04-18T12:00:00',
    source: 'cloud',
    syncState: 'synced',
    bestLap: 114000
  })
]

const firstPage = buildMergedSessionPage(localSessions, cloudSessions, 1, 2)
assert.equal(firstPage.total, 6)
assert.deepEqual(
  firstPage.pageSlice.map((session) => [session.sessionId, session.source]),
  [
    ['2026-04-23_cota', 'cloud'],
    ['2026-04-22_monza', 'local']
  ]
)
assert.equal(firstPage.pageSlice[1]?.summary?.bestLap, 103000)

const secondPage = buildMergedSessionPage(localSessions, cloudSessions, 2, 2)
assert.equal(secondPage.safePage, 2)
assert.deepEqual(
  secondPage.pageSlice.map((session) => [session.sessionId, session.source]),
  [
    ['2026-04-21_silverstone', 'local'],
    ['2026-04-20_watkins', 'cloud']
  ]
)

const thirdPage = buildMergedSessionPage(localSessions, cloudSessions, 3, 2)
assert.deepEqual(
  thirdPage.pageSlice.map((session) => [session.sessionId, session.source]),
  [
    ['2026-04-19_spa', 'local'],
    ['2026-04-18_paul_ricard', 'cloud']
  ]
)

console.log('[SESSION_PAGER_MERGE] OK')
