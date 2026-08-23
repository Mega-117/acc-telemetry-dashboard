import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

const sessionDetailSource = fs.readFileSync(
  path.join(nuxtRoot, 'app/components/pages/SessionDetailPage.vue'),
  'utf8'
)
const theoreticalSource = fs.readFileSync(
  path.join(nuxtRoot, 'app/services/telemetry/theoreticalTimesCalculator.ts'),
  'utf8'
)

assert.match(
  sessionDetailSource,
  /selectedStint\.value\?\.type === 'R'\s*\?\s*selectedStint\.value\?\.fuelStart \?\? null\s*:\s*null/,
  'Session Detail must pass stint fuelStart, not best-lap fuel, to getTheoreticalTimes for race stints.'
)

assert.match(
  theoreticalSource,
  /const stintReferenceFuelBucket = getRaceFuelBucket\(stintFuelStart\)/,
  'getTheoreticalTimes must derive the race reference bucket from stintFuelStart.'
)

assert.match(
  theoreticalSource,
  /const raceReference = resolveRaceReference\(bests, stintReferenceFuelBucket\)/,
  'Race BEST theoretical reference must use the stint starting fuel bucket.'
)

assert.match(
  theoreticalSource,
  /const avgRaceReference = resolveAvgRaceReference\(bests, stintReferenceFuelBucket\)/,
  'Race AVG theoretical reference must use the same stint starting fuel bucket.'
)

assert.match(
  theoreticalSource,
  /const qualyTheoreticalReference = buildTheoreticalReference\('qualy', null, bests\.bestQualy, bests\.bestQualyTemp, stintTemp\)/,
  'Qualifying theoretical reference must remain bestQualy with temperature adjustment.'
)

assert.match(
  theoreticalSource,
  /theoQualy: qualyTheoreticalReference\.adjustedMs/,
  'Qualifying theoretical output must use the centralized adjusted reference.'
)

assert.match(
  sessionDetailSource,
  /selectedStint\?\.type === 'Q' \? '—' : \(theoreticalTimes\.theoAvgRace/,
  'Qualifying AVG theoretical must remain disabled.'
)

assert.match(
  sessionDetailSource,
  /data-testid="stint-reference-fuel"/,
  'Race stint UI must expose the fuel-start reference label.'
)

assert.match(
  sessionDetailSource,
  /data-testid="stint-start-fuel"/,
  'Single-stint header must expose the exact starting fuel next to air and grip.'
)

assert.match(
  sessionDetailSource,
  /Riferimento: \$\{fuelLabel\} · fuori storico/,
  'A non-historical race stint must explain the exact out-of-range starting fuel.'
)

console.log('[SESSION_DETAIL_RACE_THEORETICAL_BUCKETS] OK')
