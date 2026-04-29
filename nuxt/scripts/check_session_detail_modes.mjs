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

const { loadSessionDetailViewModel } = await import('../app/services/session-detail/loadSessionDetailViewModel.ts')
const sessionDetailSource = fs.readFileSync(path.join(nuxtRoot, 'app/services/session-detail/loadSessionDetailViewModel.ts'), 'utf8')
assert.equal(
  sessionDetailSource.includes('getOverviewSnapshot'),
  false,
  'Session detail view-model must not preload overview data'
)

const fullSessionStub = {
  session_info: {
    track: 'silverstone',
    car: 'ferrari_296_gt3',
    driver: 'Driver',
    session_type: 2,
    date_start: '2026-04-21T19:57:00',
    date_end: '2026-04-21T20:25:00',
    start_air_temp: 20,
    start_road_temp: 28,
    start_track_grip: 'Optimum',
    start_weather: 'Clear',
    session_best_lap: 118900,
    avg_clean_lap: 119800,
    total_drive_time_ms: 720000,
    laps_total: 6,
    laps_valid: 6,
    laps_invalid: 0
  },
  stints: [],
  ownerId: 'owner-a',
  ownerEmail: 'owner@example.com'
}

async function runOwnerScenario() {
  const calls = []
  const result = await loadSessionDetailViewModel({
    sessionId: 'session-owner',
    currentUser: { value: { uid: 'owner-a', displayName: 'Owner A' } },
    currentUserDisplayName: 'Owner Nick',
    telemetryGateway: {
      getSessionDetail: async (sessionId, targetUserId, options) => {
        calls.push(['detail', sessionId, targetUserId ?? null, options])
        return fullSessionStub
      }
    }
  })

  assert.equal(result.currentUserNickname, 'Owner Nick')
  assert.equal(result.loadError, null)
  assert.deepEqual(calls, [
    ['detail', 'session-owner', null, { isCoachAccess: false, warmupSessions: false }]
  ])
}

async function runSharedScenario() {
  const calls = []
  const result = await loadSessionDetailViewModel({
    sessionId: 'session-shared',
    externalUserId: 'shared-user',
    currentUser: { value: { uid: 'viewer', displayName: 'Viewer' } },
    currentUserDisplayName: 'Viewer Nick',
    telemetryGateway: {
      getSessionDetail: async (sessionId, targetUserId, options) => {
        calls.push(['detail', sessionId, targetUserId ?? null, options])
        return fullSessionStub
      }
    }
  })

  assert.equal(result.currentUserNickname, 'Viewer Nick')
  assert.equal(result.userIdToLoad, 'shared-user')
  assert.equal(result.loadError, null)
  assert.deepEqual(calls, [
    ['detail', 'session-shared', 'shared-user', { isCoachAccess: false, warmupSessions: false }]
  ])
}

async function runCoachScenario() {
  const calls = []
  const result = await loadSessionDetailViewModel({
    sessionId: 'session-coach',
    targetUserId: 'pilot-123',
    currentUser: { value: { uid: 'coach-user', displayName: 'Coach User' } },
    currentUserDisplayName: 'Coach Nick',
    telemetryGateway: {
      getSessionDetail: async (sessionId, targetUserId, options) => {
        calls.push(['detail', sessionId, targetUserId ?? null, options])
        return fullSessionStub
      }
    }
  })

  assert.equal(result.currentUserNickname, 'Coach Nick')
  assert.equal(result.userIdToLoad, 'pilot-123')
  assert.equal(result.loadError, null)
  assert.deepEqual(calls, [
    ['detail', 'session-coach', 'pilot-123', { isCoachAccess: true, warmupSessions: false }]
  ])
}

await runOwnerScenario()
await runSharedScenario()
await runCoachScenario()

console.log('[SESSION_DETAIL_MODES] OK')
