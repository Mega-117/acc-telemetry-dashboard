// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'app/pages/training-overlay.vue'), 'utf8')

describe('training overlay qa bot boundary', () => {
  it('uses only the bounded preload API and renders canonical state', () => {
    expect(source).toContain('trainingOverlayGetQaBotState')
    expect(source).toContain('trainingOverlayStartQaBot')
    expect(source).toContain('trainingOverlayStopQaBot')
    expect(source).toContain('qaBotView.stateLabel')
    expect(source).not.toMatch(/(?:spawn|child_process|ipcRenderer|writeFile).*qaBot/i)
  })
})
