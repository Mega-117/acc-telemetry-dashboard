import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const servicePath = path.resolve(scriptDir, '../app/services/telemetry/activityProjectionService.ts')
const gatewayPath = path.resolve(scriptDir, '../app/composables/useTelemetryGateway.ts')
const electronSyncPath = path.resolve(scriptDir, '../app/composables/useElectronSync.ts')

function loadActivityService() {
  const source = fs.readFileSync(servicePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText

  const sandbox = {
    exports: {},
    require: () => ({})
  }
  vm.runInNewContext(transpiled, sandbox, { filename: servicePath })
  return sandbox.exports
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function minutes(value) {
  return value * 60_000
}

const activity = loadActivityService()
const sessionTypes = { PRACTICE: 0, QUALIFY: 1, RACE: 2 }
const now = new Date(2026, 4, 3, 12, 0, 0)
const projection = activity.buildActivityProjectionFromEntries({
  now,
  sessionTypes,
  entries: [
    { dateStart: '2026-04-26T22:18:00', sessionType: 1, totalTimeMs: minutes(105) },
    { dateStart: '2026-04-27T00:13:00', sessionType: 1, totalTimeMs: minutes(41) },
    { dateStart: '2026-04-27T20:51:00', sessionType: 0, totalTimeMs: minutes(18) },
    { dateStart: '2026-04-27T21:18:00', sessionType: 1, totalTimeMs: minutes(14) },
    { dateStart: '2026-04-27T21:35:00', sessionType: 2, totalTimeMs: minutes(52) },
    { dateStart: '2026-04-30T20:49:14.145470', sessionType: 1, totalTimeMs: minutes(7) },
    { dateStart: '2026-04-30T21:30:50.681287', sessionType: 1, totalTimeMs: minutes(5) },
    { dateStart: '2026-04-30T21:49:04.451008', sessionType: 2, totalTimeMs: minutes(83) },
    { dateStart: '2026-05-01T15:37:00', sessionType: 0, totalTimeMs: minutes(43) },
    { dateStart: '2026-05-01T20:36:00', sessionType: 0, totalTimeMs: minutes(26) },
    { dateStart: '2026-05-01T21:20:00', sessionType: 0, totalTimeMs: minutes(8) },
    { dateStart: '2026-05-01T21:52:00', sessionType: 0, totalTimeMs: minutes(4) },
    { dateStart: '2026-05-01T22:02:00', sessionType: 1, totalTimeMs: minutes(10) },
    { dateStart: '2026-05-01T22:16:00', sessionType: 2, totalTimeMs: minutes(41) }
  ]
})

assert(
  projection.data.map((row) => row.date).join(',') === '2026-04-27,2026-04-28,2026-04-29,2026-04-30,2026-05-01,2026-05-02,2026-05-03',
  'activity window must be the last 7 calendar days including today'
)

const apr30 = projection.data.find((row) => row.date === '2026-04-30')
assert(apr30?.day === 'Gio', '2026-04-30 must be Thursday in the chart')
assert(apr30?.dateLabel === '30/04', '2026-04-30 must expose a readable date label')
assert(apr30?.practice === 0 && apr30?.qualify === 12 && apr30?.race === 83, '2026-04-30 activity must be Q 12m + R 83m')
assert(!projection.byDay.some((row) => row.date === '2026-04-26'), '2026-04-26 must not be included in a 7-column window ending 2026-05-03')

assert(projection.totals.practice.minutes === 99, 'practice minutes must be 99')
assert(projection.totals.practice.sessions === 5, 'practice sessions must be 5')
assert(projection.totals.qualify.minutes === 77, 'qualify minutes must be 77')
assert(projection.totals.qualify.sessions === 5, 'qualify sessions must be 5')
assert(projection.totals.race.minutes === 176, 'race minutes must be 176')
assert(projection.totals.race.sessions === 3, 'race sessions must be 3')

assert(activity.getTelemetryActivityDateKey('2026-04-30T21:49:04.451008') === '2026-04-30', 'telemetry date key must ignore local timestamp decimals')

const gatewaySource = fs.readFileSync(gatewayPath, 'utf8')
assert(gatewaySource.includes('stale_activity7d_totals_mismatch'), 'overview projection must fall back when activity totals and daily bars diverge')

const electronSyncSource = fs.readFileSync(electronSyncPath, 'utf8')
assert(electronSyncSource.includes('findMissingRecentSessionIndexIds'), 'electron sync must verify recent uploaded sessions against sessionIndex')
assert(electronSyncSource.includes('forcing user projection rebuild'), 'electron sync must force rebuild for stale recent sessionIndex gaps')

console.log('[ACTIVITY_7D_CHECK] OK')
