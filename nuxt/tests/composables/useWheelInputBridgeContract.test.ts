import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'app/composables/useWheelInputBridge.ts'),
  'utf8',
)

describe('wheel input bridge timing contract', () => {
  test('settings waits for configuration cleanup before leaving the route', () => {
    const page = fs.readFileSync(path.resolve(process.cwd(), 'app/pages/impostazioni.vue'), 'utf8')
    expect(page).toContain('onBeforeRouteLeave(async () => { await bridge.finishConfiguration() })')
  })

  test('polls independently from paint frames at the declared cadence', () => {
    expect(source).toContain('const WHEEL_POLL_INTERVAL_MS = 8')
    expect(source).toContain('window.setInterval(poll, WHEEL_POLL_INTERVAL_MS)')
    expect(source).not.toContain('requestAnimationFrame')
  })

  test('timestamps only snapshots whose button state changed', () => {
    const signatureIndex = source.indexOf('if (signature !== lastSignature)')
    const reportIndex = source.indexOf('controlsReportSnapshot({ ...snapshot, sampledAtMs })')
    expect(signatureIndex).toBeGreaterThan(-1)
    expect(reportIndex).toBeGreaterThan(signatureIndex)
  })
})
