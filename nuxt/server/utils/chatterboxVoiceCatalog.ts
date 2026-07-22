import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export const CHATTERBOX_DEFAULT_VOICE_ID = '__default__'

export interface ChatterboxVoice {
  id: string
  name: string
  kind: 'default' | 'sample'
  filename?: string
}

export function resolveChatterboxVoiceDir(cwd = process.cwd()) {
  return resolve(
    process.env.ACC_CHATTERBOX_VOICES_DIR || resolve(cwd, '..', 'training_data', 'chatterbox_voices'),
  )
}

function voiceLabel(filename: string) {
  const stem = filename.replace(/\.wav$/i, '')
  const words = stem.split(/[_-]+/).filter(Boolean)
  if (!words.length) return stem
  return words.map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ')
}

export function listChatterboxVoices(voiceDir = resolveChatterboxVoiceDir()): ChatterboxVoice[] {
  const voices: ChatterboxVoice[] = [{
    id: CHATTERBOX_DEFAULT_VOICE_ID,
    name: 'Predefinita Chatterbox',
    kind: 'default',
  }]

  if (!existsSync(voiceDir)) return voices

  const samples = readdirSync(voiceDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.wav'))
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }))
    .map(entry => ({
      id: entry.name,
      name: voiceLabel(entry.name),
      kind: 'sample' as const,
      filename: entry.name,
    }))

  return [...voices, ...samples]
}

export function resolveChatterboxVoicePrompt(voiceId: string, voiceDir = resolveChatterboxVoiceDir()) {
  if (voiceId === CHATTERBOX_DEFAULT_VOICE_ID) return null
  const voice = listChatterboxVoices(voiceDir).find(candidate => candidate.id === voiceId && candidate.kind === 'sample')
  return voice?.filename ? resolve(voiceDir, voice.filename) : undefined
}
