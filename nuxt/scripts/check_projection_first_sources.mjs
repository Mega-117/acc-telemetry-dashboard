import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const gatewayPath = path.resolve(scriptDir, '../app/composables/useTelemetryGateway.ts')
const source = fs.readFileSync(gatewayPath, 'utf8')

function extractFunctionBody(functionName) {
  const asyncSignature = `async function ${functionName}(`
  const syncSignature = `function ${functionName}(`
  const asyncStart = source.indexOf(asyncSignature)
  const syncStart = source.indexOf(syncSignature)
  const start = asyncStart !== -1 ? asyncStart : syncStart
  if (start === -1) {
    throw new Error(`Missing function ${functionName}`)
  }

  const braceStart = source.indexOf('{', start)
  if (braceStart === -1) {
    throw new Error(`Missing body for ${functionName}`)
  }

  let depth = 0
  for (let index = braceStart; index < source.length; index++) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) {
      return source.slice(braceStart, index + 1)
    }
  }

  throw new Error(`Unclosed body for ${functionName}`)
}

const checks = [
  {
    functionName: 'getOverviewProjection',
    forbidden: ['getOverviewSnapshot(', 'telemetry.loadSessions(', 'fetchSessionFull(']
  },
  {
    functionName: 'getTracksOverviewProjection',
    forbidden: ['getOverviewSnapshot(', 'telemetry.loadSessions(', 'fetchSessionFull(']
  },
  {
    functionName: 'getTrackDetailProjection',
    forbidden: ['getOverviewSnapshot(', 'getTrackSnapshot(', 'telemetry.loadSessions(', 'fetchSessionFull(']
  }
]

const failures = []
for (const check of checks) {
  const body = extractFunctionBody(check.functionName)
  for (const forbidden of check.forbidden) {
    if (body.includes(forbidden)) {
      failures.push(`${check.functionName} contains forbidden standard-flow call: ${forbidden}`)
    }
  }
}

const trackDetailBuilder = extractFunctionBody('buildTrackDetailFromProjectionDocument')
const trackDetailBuilderStart = source.indexOf('function buildTrackDetailFromProjectionDocument(')
const trackDetailBuilderEnd = source.indexOf('export function useTelemetryGateway()', trackDetailBuilderStart)
const trackDetailBuilderSource = source.slice(trackDetailBuilderStart, trackDetailBuilderEnd)
void trackDetailBuilder
for (const required of ['raceFuelBuckets', 'raceBestByFuelBucket', 'raceAvgByFuelBucket', 'bestRaceFuelBucket', 'bestAvgRaceFuelBucket']) {
  if (!trackDetailBuilderSource.includes(required)) {
    failures.push(`buildTrackDetailFromProjectionDocument does not forward ${required}`)
  }
}

if (failures.length > 0) {
  console.error('[PROJECTION_FIRST_CHECK] FAILED')
  for (const failure of failures) {
    console.error(` - ${failure}`)
  }
  process.exit(1)
}

console.log('[PROJECTION_FIRST_CHECK] OK')
