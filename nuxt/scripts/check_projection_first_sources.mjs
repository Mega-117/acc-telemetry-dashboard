import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const gatewayPath = path.resolve(scriptDir, '../app/composables/useTelemetryGateway.ts')
const trackDetailBuilderPath = path.resolve(scriptDir, '../app/services/gateway/trackDetailProjectionBuilder.ts')
const source = fs.readFileSync(gatewayPath, 'utf8')
const trackDetailBuilderFileSource = fs.readFileSync(trackDetailBuilderPath, 'utf8')

function extractFunctionBody(functionName, functionSource = source) {
  const asyncSignature = `async function ${functionName}(`
  const syncSignature = `function ${functionName}(`
  const asyncStart = functionSource.indexOf(asyncSignature)
  const syncStart = functionSource.indexOf(syncSignature)
  const start = asyncStart !== -1 ? asyncStart : syncStart
  if (start === -1) {
    throw new Error(`Missing function ${functionName}`)
  }

  const paramsStart = functionSource.indexOf('(', start)
  if (paramsStart === -1) {
    throw new Error(`Missing parameter list for ${functionName}`)
  }

  let paramsDepth = 0
  let paramsEnd = -1
  for (let index = paramsStart; index < functionSource.length; index++) {
    const char = functionSource[index]
    if (char === '(') paramsDepth += 1
    if (char === ')') paramsDepth -= 1
    if (paramsDepth === 0) {
      paramsEnd = index
      break
    }
  }
  if (paramsEnd === -1) {
    throw new Error(`Unclosed parameter list for ${functionName}`)
  }

  const braceStart = functionSource.indexOf('{', paramsEnd)
  if (braceStart === -1) {
    throw new Error(`Missing body for ${functionName}`)
  }

  let depth = 0
  for (let index = braceStart; index < functionSource.length; index++) {
    const char = functionSource[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) {
      return functionSource.slice(braceStart, index + 1)
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

const trackDetailBuilderSource = extractFunctionBody(
  'buildTrackDetailFromProjectionDocument',
  trackDetailBuilderFileSource
)
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
