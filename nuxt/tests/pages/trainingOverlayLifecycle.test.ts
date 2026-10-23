// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'app/pages/training-overlay.vue'), 'utf8')

describe('training overlay lifecycle (PIP-591)', () => {
  it('"Skippa step" goes through the driving-session check like Avanti and Riprendi', () => {
    const button = source.slice(source.indexOf('data-overlay-wheel-action="skip-step"'))
    expect(button.slice(0, button.indexOf('</button>'))).toContain('@click="skipPausedStepIfSourceReady"')
    expect(source).toMatch(/function skipPausedStepIfSourceReady\(\) \{\s*if \(trainingSourceReady\(\)\) skipPausedStep\(\)/)
    expect(source).not.toContain('@click="skipPausedStep"')
  })

  it('unmounting also stops the auto-advance countdown', () => {
    const cleanup = source.split('
').find((line) => line.includes('stopFastStatePolling(); stopVoice(); cleanupSize()'))
    expect(cleanup).toContain('clearTimer(); cancelAutoAdvance();')
  })
})
