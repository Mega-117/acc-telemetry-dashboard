import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const api = readFileSync(resolve(process.cwd(), 'server/api/dev/chatterbox-speak.post.ts'), 'utf8')
const runtime = readFileSync(resolve(process.cwd(), 'scripts/chatterbox_tts_server.py'), 'utf8')

describe('Chatterbox speak prosody contract', () => {
  it('valida e inoltra i parametri dal server Nuxt', () => {
    expect(api).toContain('resolveChatterboxProsody(body)')
    expect(api).toContain('JSON.stringify({ text, voice, ...prosody })')
  })

  it('passa exaggeration e cfg_weight a Multilingual V3', () => {
    expect(runtime).toContain('"exaggeration": exaggeration')
    expect(runtime).toContain('"cfg_weight": cfg_weight')
    expect(runtime).toContain('prosody_value(body, "exaggeration", DEFAULT_EXAGGERATION)')
    expect(runtime).toContain('prosody_value(body, "cfgWeight", DEFAULT_CFG_WEIGHT)')
  })
})
