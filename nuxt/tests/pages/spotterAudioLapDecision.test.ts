import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('PIP-716: the audio window says what it decided for every completed lap', () => {
  const page = readFileSync('app/pages/spotter-audio-runtime.vue', 'utf8')

  it('one lap decision, with the WAV of the time it chose, also when switched off', () => {
    expect(page).toContain("kind: 'lap_decision', correlationId: id, source: 'lap-time', outcome, scenarioId: wav")
    expect(page).toContain("{ decide('off'); return }")
    expect(page).toContain("decide(timeWav ? 'announce' : 'out_of_range', timeWav)")
  })

  it('tells the main process whether it may speak, from the start', () => {
    expect(page).toMatch(/kind: canRun \? 'runtime_authorized' : 'runtime_denied'[\s\S]*?\}, \{ immediate: true \}\)/)
  })
})

describe('PIP-716: automation and Pitwall outcomes are answered', () => {
  const page = readFileSync('app/pages/spotter-audio-runtime.vue', 'utf8')
  it('every outcome with a check id gets announce / none / off', () => {
    expect(page).toContain("voiceRuntimeDiagnostics.record({ kind: 'cue_decision', correlationId: id, source, outcome })")
    expect(page).toContain("answer(event, 'setup-automation', cue ? 'announce' : 'none')")
    expect(page).toContain("answer(event, 'pit-strategy', cue ? 'announce' : 'none')")
    expect(page.match(/answer\(event, '(setup-automation|pit-strategy)', 'off'\)/g)).toHaveLength(2)
  })
})
