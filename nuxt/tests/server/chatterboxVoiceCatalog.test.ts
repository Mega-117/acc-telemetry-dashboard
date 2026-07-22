import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHATTERBOX_DEFAULT_VOICE_ID,
  listChatterboxVoices,
  resolveChatterboxVoicePrompt,
} from '../../server/utils/chatterboxVoiceCatalog'

const cleanup: string[] = []

function tempVoiceDir() {
  const dir = mkdtempSync(join(tmpdir(), 'acc-chatterbox-'))
  cleanup.push(dir)
  return dir
}

afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true })
})

describe('chatterboxVoiceCatalog', () => {
  it('espone sempre la voce predefinita anche se la cartella non esiste', () => {
    const voices = listChatterboxVoices(join(tempVoiceDir(), 'missing'))
    expect(voices).toEqual([{ id: CHATTERBOX_DEFAULT_VOICE_ID, name: 'Predefinita Chatterbox', kind: 'default' }])
  })

  it('elenca tutti e soli i WAV locali con ordine e label stabili', () => {
    const dir = tempVoiceDir()
    writeFileSync(join(dir, 'voce_mario.wav'), 'wav')
    writeFileSync(join(dir, 'anna-coach.WAV'), 'wav')
    writeFileSync(join(dir, 'nota.txt'), 'ignore')
    mkdirSync(join(dir, 'cartella.wav'))

    expect(listChatterboxVoices(dir)).toEqual([
      { id: CHATTERBOX_DEFAULT_VOICE_ID, name: 'Predefinita Chatterbox', kind: 'default' },
      { id: 'anna-coach.WAV', name: 'Anna Coach', kind: 'sample', filename: 'anna-coach.WAV' },
      { id: 'voce_mario.wav', name: 'Voce Mario', kind: 'sample', filename: 'voce_mario.wav' },
    ])
  })

  it('risolve solo campioni presenti nel catalogo, senza traversal', () => {
    const dir = tempVoiceDir()
    writeFileSync(join(dir, 'pilota.wav'), 'wav')

    expect(resolveChatterboxVoicePrompt(CHATTERBOX_DEFAULT_VOICE_ID, dir)).toBeNull()
    expect(resolveChatterboxVoicePrompt('pilota.wav', dir)).toBe(join(dir, 'pilota.wav'))
    expect(resolveChatterboxVoicePrompt('../pilota.wav', dir)).toBeUndefined()
    expect(resolveChatterboxVoicePrompt('rimossa.wav', dir)).toBeUndefined()
  })
})
