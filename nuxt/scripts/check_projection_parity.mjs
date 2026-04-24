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
    const indexCandidates = ['index.ts', 'index.js', 'index.mjs', 'index.json']
    for (const indexCandidate of indexCandidates) {
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

const [{ extractMetadata, BEST_RULES_VERSION }, { buildOverviewProjection }, { buildTrackOverviewProjection }, { buildTrackDetailProjection }, { TRACK_METADATA, normalizeTrackId }] = await Promise.all([
  import('../app/utils/sessionParser.ts'),
  import('../app/services/projections/buildOverviewProjection.ts'),
  import('../app/services/projections/buildTrackOverviewProjection.ts'),
  import('../app/services/projections/buildTrackDetailProjection.ts'),
  import('../app/services/projections/trackMetadata.ts')
])

function formatLapTime(ms) {
  if (!ms || ms <= 0) return '--:--.---'
  const totalMs = Math.round(ms)
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function formatDriveTime(ms) {
  if (!ms || ms <= 0) return '0m'
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}` : `${minutes}m`
}

function formatCarName(car) {
  return car === 'ferrari_296_gt3' ? 'Ferrari 296 GT3' : car
}

function formatTrackName(track) {
  return (track || '')
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function formatDate(date) {
  return date ? String(date).split('T')[0] : '-'
}

function getSessionTypeLabel(type) {
  if (type === 1) return 'qualify'
  if (type === 2) return 'race'
  return 'practice'
}

const legacyRaceNonHistoricalRaw = {
  session_info: {
    date_start: '2026-04-21T19:57:00',
    track: 'silverstone',
    car: 'ferrari_296_gt3',
    session_type: 0,
    laps_total: 6,
    laps_valid: 6,
    total_drive_time_ms: 720000,
    avg_clean_lap: 119800,
    session_best_lap: 118900
  },
  stints: [
    {
      fuel_start: 30,
      type: 'Race',
      avg_clean_lap: 119800,
      laps: [
        {
          lap_time_ms: 118900,
          is_valid: true,
          has_pit_stop: false,
          sector_times_ms: [39500, 39600, 39800],
          fuel_start: 30,
          fuel_remaining: 28,
          air_temp: 20,
          road_temp: 28,
          track_grip_status: 'Optimum'
        },
        {
          lap_time_ms: 119100,
          is_valid: true,
          has_pit_stop: false,
          sector_times_ms: [39600, 39700, 39800],
          fuel_start: 29,
          fuel_remaining: 27,
          air_temp: 20,
          road_temp: 28,
          track_grip_status: 'Optimum'
        },
        {
          lap_time_ms: 119400,
          is_valid: true,
          has_pit_stop: false,
          sector_times_ms: [39700, 39800, 39900],
          fuel_start: 28,
          fuel_remaining: 26,
          air_temp: 20,
          road_temp: 28,
          track_grip_status: 'Optimum'
        },
        {
          lap_time_ms: 120000,
          is_valid: true,
          has_pit_stop: false,
          sector_times_ms: [40000, 40000, 40000],
          fuel_start: 27,
          fuel_remaining: 25,
          air_temp: 20,
          road_temp: 28,
          track_grip_status: 'Optimum'
        },
        {
          lap_time_ms: 120500,
          is_valid: true,
          has_pit_stop: false,
          sector_times_ms: [40100, 40100, 40300],
          fuel_start: 26,
          fuel_remaining: 24,
          air_temp: 20,
          road_temp: 28,
          track_grip_status: 'Optimum'
        }
      ]
    }
  ]
}

const { meta: canonicalMeta, summary: missingCanonicalSummary, summarySource: missingCanonicalSource } =
  extractMetadata(legacyRaceNonHistoricalRaw)
assert.equal(missingCanonicalSource, 'missing_canonical')
assert.equal(missingCanonicalSummary.best_session_race_ms, null)
assert.equal(missingCanonicalSummary.best_race_ms, null)

const { summary: legacySummary, summarySource: legacySummarySource } = extractMetadata(
  legacyRaceNonHistoricalRaw,
  { allowLegacyFallback: true }
)
assert.equal(legacySummarySource, 'legacy_fallback')
assert.equal(legacySummary.best_session_race_ms, 118900)
assert.equal(legacySummary.best_race_ms, null)
assert.equal(legacySummary.best_by_grip.Optimum.bestRace, null)

const canonicalPayload = {
  ...legacyRaceNonHistoricalRaw,
  summary: {
    laps: 6,
    lapsValid: 6,
    bestLap: 118900,
    avgCleanLap: 119800,
    totalTime: 720000,
    stintCount: 1,
    best_qualy_ms: null,
    best_qualy_conditions: null,
    best_session_race_ms: 118900,
    best_session_race_conditions: { airTemp: 20, roadTemp: 28, grip: 'Optimum' },
    best_race_ms: null,
    best_race_conditions: null,
    best_avg_race_ms: null,
    best_avg_race_conditions: null,
    best_rules_version: BEST_RULES_VERSION,
    best_by_grip: {
      Optimum: {
        bestQualy: null,
        bestQualyTemp: null,
        bestQualyFuel: null,
        bestRace: null,
        bestRaceTemp: null,
        bestRaceFuel: null,
        bestAvgRace: null,
        bestAvgRaceTemp: null,
        bestAvgRaceFuel: null
      }
    }
  }
}

const { summary: parsedCanonicalSummary, summarySource: canonicalSummarySource } = extractMetadata(canonicalPayload)
assert.equal(canonicalSummarySource, 'canonical')
assert.equal(parsedCanonicalSummary.best_session_race_ms, 118900)
assert.equal(parsedCanonicalSummary.best_race_ms, null)

const silverstoneRaceNonHistorical = {
  sessionId: 'silverstone-race-20-40',
  meta: {
    ...canonicalMeta,
    date_start: '2026-04-21T19:57:00',
    track: 'silverstone',
    car: 'ferrari_296_gt3',
    session_type: 0
  },
  summary: parsedCanonicalSummary,
  summarySource: 'canonical',
  source: 'cloud'
}

const silverstoneRaceHistorical = {
  sessionId: 'silverstone-race-40plus',
  meta: {
    ...canonicalMeta,
    date_start: '2026-04-20T18:30:00',
    track: 'silverstone',
    car: 'ferrari_296_gt3',
    session_type: 0
  },
  summary: {
    ...parsedCanonicalSummary,
    totalTime: 760000,
    best_session_race_ms: 119500,
    best_session_race_conditions: { airTemp: 21, roadTemp: 29, grip: 'Optimum' },
    best_race_ms: 119500,
    best_race_conditions: { airTemp: 21, roadTemp: 29, grip: 'Optimum' },
    best_avg_race_ms: 120000,
    best_avg_race_conditions: { airTemp: 21, roadTemp: 29, grip: 'Optimum' },
    best_by_grip: {
      Optimum: {
        bestQualy: null,
        bestQualyTemp: null,
        bestQualyFuel: null,
        bestRace: 119500,
        bestRaceTemp: 21,
        bestRaceFuel: 52,
        bestAvgRace: 120000,
        bestAvgRaceTemp: 21,
        bestAvgRaceFuel: 52
      }
    }
  },
  summarySource: 'canonical',
  source: 'cloud'
}

const monzaQualy = {
  sessionId: 'monza-qualy',
  meta: {
    ...canonicalMeta,
    date_start: '2026-04-16T14:10:00',
    track: 'monza',
    car: 'ferrari_296_gt3',
    session_type: 1
  },
  summary: {
    ...parsedCanonicalSummary,
    bestLap: 103180,
    best_qualy_ms: 103180,
    best_qualy_conditions: { airTemp: 18, roadTemp: 24, grip: 'Optimum' },
    best_session_race_ms: null,
    best_session_race_conditions: null,
    best_race_ms: null,
    best_race_conditions: null,
    best_avg_race_ms: null,
    best_avg_race_conditions: null,
    best_by_grip: {
      Optimum: {
        bestQualy: 103180,
        bestQualyTemp: 18,
        bestQualyFuel: 12,
        bestRace: null,
        bestRaceTemp: null,
        bestRaceFuel: null,
        bestAvgRace: null,
        bestAvgRaceTemp: null,
        bestAvgRaceFuel: null
      }
    }
  },
  summarySource: 'canonical',
  source: 'cloud'
}

const trackDetailProjection = buildTrackDetailProjection({
  trackId: 'silverstone',
  metadata: TRACK_METADATA.silverstone,
  visibleSessions: [silverstoneRaceNonHistorical, silverstoneRaceHistorical],
  selectedGrip: 'Optimum',
  selectedCategory: 'GT3',
  recalculatedBestByGrip: {
    Optimum: {
      bestQualy: null,
      bestRace: 119500,
      bestRaceTemp: 21,
      bestRaceFuel: 52,
      bestAvgRace: 120000,
      bestAvgRaceTemp: 21,
      bestAvgRaceFuel: 52,
      bestQualySessionId: null,
      bestRaceSessionId: 'silverstone-race-40plus',
      bestAvgRaceSessionId: 'silverstone-race-40plus',
      bestQualyDate: null,
      bestRaceDate: '2026-04-20T18:30:00',
      bestAvgRaceDate: '2026-04-20T18:30:00'
    }
  },
  bestFuelData: { qualyFuel: null, raceFuel: 52 },
  formatLapTime,
  formatDriveTime,
  formatCarName,
  getSessionTypeLabel,
  currentTrackStat: {
    lastSession: '2026-04-21T19:57:00'
  }
})

assert.equal(trackDetailProjection.track.bestRace, '1:59.500')
assert.equal(trackDetailProjection.track.bestAvgRace, '2:00.000')
assert.equal(trackDetailProjection.recentSessions[0]?.bestRace, '1:58.900')
assert.equal(
  trackDetailProjection.historicalTimes.find((point) => point.sessionId === 'silverstone-race-20-40')?.bestRace,
  undefined
)
assert.equal(
  trackDetailProjection.historicalTimes.find((point) => point.sessionId === 'silverstone-race-40plus')?.bestRace,
  '1:59.500'
)

const trackOverviewProjection = buildTrackOverviewProjection({
  trackMetadata: Object.fromEntries(
    Object.entries(TRACK_METADATA).map(([id, metadata]) => [
      id,
      {
        name: metadata.name,
        country: metadata.countryCode,
        length: metadata.length,
        image: metadata.image
      }
    ])
  ),
  trackStats: [
    {
      track: 'silverstone',
      sessions: 2,
      lastSession: '2026-04-21T19:57:00',
      bestQualy: null,
      bestRace: null,
      bestByGrip: {}
    },
    {
      track: 'monza',
      sessions: 1,
      lastSession: '2026-04-16T14:10:00',
      bestQualy: 103180,
      bestRace: null,
      bestByGrip: {
        Optimum: {
          bestQualy: 103180,
          bestRace: null
        }
      }
    }
  ],
  trackBestsMap: {
    silverstone: { bestQualy: null, bestRace: 119500 },
    monza: { bestQualy: 103180, bestRace: null }
  },
  normalizeTrackId,
  formatLapTime
})

assert.equal(trackOverviewProjection[0]?.id, 'silverstone')
assert.equal(trackOverviewProjection[0]?.bestRace, '1:59.500')
assert.equal(trackOverviewProjection.find((track) => track.id === 'monza')?.bestQualy, '1:43.180')

const overviewProjection = buildOverviewProjection({
  lastUsedCar: 'ferrari_296_gt3',
  lastSessionDate: '2026-04-21T19:57:00',
  trackStats: [
    { track: 'silverstone', lastSession: '2026-04-21T19:57:00' },
    { track: 'monza', lastSession: '2026-04-16T14:10:00' }
  ],
  bestsByTrack: {
    silverstone: { bestQualy: null, bestRace: 119500, bestAvgRace: 120000 },
    monza: { bestQualy: 103180, bestRace: null, bestAvgRace: null }
  },
  activity7d: [
    { date: '2026-04-21', label: 'Lun', practice: 0, qualify: 0, race: 119 },
    { date: '2026-04-22', label: 'Mar', practice: 0, qualify: 0, race: 0 }
  ],
  activityTotals: {
    practice: { minutes: 0, sessions: 0 },
    qualify: { minutes: 0, sessions: 0 },
    race: { minutes: 119, sessions: 2 }
  },
  normalizeTrackId,
  formatLapTime,
  formatCarName,
  formatTrackName,
  formatDate
})

assert.equal(overviewProjection.lastCar.displayName, 'Ferrari 296 GT3'.toUpperCase())
assert.equal(overviewProjection.lastTrack?.id, 'silverstone')
assert.equal(overviewProjection.lastTrack?.bestRace, '1:59.500')
assert.equal(overviewProjection.previousTrack?.id, 'monza')

const overviewProjectionSecondPass = buildOverviewProjection({
  lastUsedCar: 'ferrari_296_gt3',
  lastSessionDate: '2026-04-21T19:57:00',
  trackStats: [
    { track: 'silverstone', lastSession: '2026-04-21T19:57:00' },
    { track: 'monza', lastSession: '2026-04-16T14:10:00' }
  ],
  bestsByTrack: {
    silverstone: { bestQualy: null, bestRace: 119500, bestAvgRace: 120000 },
    monza: { bestQualy: 103180, bestRace: null, bestAvgRace: null }
  },
  activity7d: [
    { date: '2026-04-21', label: 'Lun', practice: 0, qualify: 0, race: 119 },
    { date: '2026-04-22', label: 'Mar', practice: 0, qualify: 0, race: 0 }
  ],
  activityTotals: {
    practice: { minutes: 0, sessions: 0 },
    qualify: { minutes: 0, sessions: 0 },
    race: { minutes: 119, sessions: 2 }
  },
  normalizeTrackId,
  formatLapTime,
  formatCarName,
  formatTrackName,
  formatDate
})

assert.deepEqual(overviewProjectionSecondPass, overviewProjection)
assert.deepEqual(
  buildTrackDetailProjection({
    trackId: 'silverstone',
    metadata: TRACK_METADATA.silverstone,
    visibleSessions: [silverstoneRaceNonHistorical, silverstoneRaceHistorical],
    selectedGrip: 'Optimum',
    selectedCategory: 'GT3',
    recalculatedBestByGrip: {
      Optimum: {
        bestQualy: null,
        bestRace: 119500,
        bestRaceTemp: 21,
        bestRaceFuel: 52,
        bestAvgRace: 120000,
        bestAvgRaceTemp: 21,
        bestAvgRaceFuel: 52,
        bestQualySessionId: null,
        bestRaceSessionId: 'silverstone-race-40plus',
        bestAvgRaceSessionId: 'silverstone-race-40plus',
        bestQualyDate: null,
        bestRaceDate: '2026-04-20T18:30:00',
        bestAvgRaceDate: '2026-04-20T18:30:00'
      }
    },
    bestFuelData: { qualyFuel: null, raceFuel: 52 },
    formatLapTime,
    formatDriveTime,
    formatCarName,
    getSessionTypeLabel,
    currentTrackStat: {
      lastSession: '2026-04-21T19:57:00'
    }
  }),
  trackDetailProjection
)

console.log('[PARITY_CHECK] OK')
