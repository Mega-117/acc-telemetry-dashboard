import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VOICE_IDS, isVoiceId, voiceForLanguage, voiceLanguage, voicesForLanguage } from '~/config/voiceCatalog'
import { lapTimeAnnouncementPaths, lapTimeVoiceText, resolveLapTimeVoiceEntry } from '~/services/overlay/lapTimeAnnouncer'
import voiceScript from '~/config/voiceScript.json'
import coachScript from '~/config/coachVoiceScript.json'
import trackPoints from '../../server/data/track-voice-points.defaults.json'

const root = process.cwd()

describe('PIP-667 voice catalog', () => {
  it('Italian speaks with Sara/Nicola, English with Heart/Michael', () => {
    expect(voicesForLanguage('it').map(v => v.id)).toEqual(['if_sara', 'im_nicola'])
    expect(voicesForLanguage('en').map(v => v.id)).toEqual(['af_heart', 'am_michael'])
    expect(voiceLanguage('af_heart')).toBe('en')
    expect(isVoiceId('af_bella')).toBe(false)
  })

  it('switching language keeps the same kind of voice, both ways; unknown values give the woman', () => {
    expect(voiceForLanguage('im_nicola', 'en')).toBe('am_michael')
    expect(voiceForLanguage('am_michael', 'it')).toBe('im_nicola')
    expect(voiceForLanguage('if_sara', 'en')).toBe('af_heart')
    expect(voiceForLanguage('af_heart', 'en')).toBe('af_heart')
    expect(voiceForLanguage('garbage', 'en')).toBe('af_heart')
    expect(voiceForLanguage(null, 'it')).toBe('if_sara')
  })

  it('the Python generators and the voice scripts know the same four voices (the program: desktop kokoroRuntime test)', () => {
    const python = readFileSync(resolve(root, 'scripts/voice_language.py'), 'utf8')
    expect(python).toContain(`ALL_VOICES = [${VOICE_IDS.map(id => `"${id}"`).join(', ')}]`)
    expect(voiceScript.voices).toEqual([...VOICE_IDS])
    expect(coachScript.voices).toEqual([...VOICE_IDS])
  })
})

describe('PIP-667 English lap times, radio form to the tenth', () => {
  it('reads the user examples', () => {
    expect(lapTimeVoiceText(1057, 'en')).toBe('one forty-five, point seven.')
    expect(lapTimeVoiceText(1243, 'en')).toBe('two oh-four, point three.')
    expect(lapTimeVoiceText(1200, 'en')).toBe('two oh-oh, point zero.')
    expect(lapTimeVoiceText(1509, 'en')).toBe('two thirty, point nine.')
    expect(lapTimeVoiceText(1057)).toBe('uno, quarantacinque, punto sette.')
  })

  it('keeps the range rules: valid out of range is silent, invalid keeps its cue', () => {
    expect(resolveLapTimeVoiceEntry(79_999, true, 'af_heart')).toBeNull()
    expect(resolveLapTimeVoiceEntry(80_000, true, 'af_heart')?.path).toBe('/voice/qualifying/lap-time-0800-af_heart.wav')
    expect(resolveLapTimeVoiceEntry(150_999, true, 'am_michael')?.path).toBe('/voice/qualifying/lap-time-1509-am_michael.wav')
    expect(resolveLapTimeVoiceEntry(151_000, true, 'am_michael')).toBeNull()
    expect(lapTimeAnnouncementPaths(200_000, false, 'am_michael')).toEqual(['/voice/qualifying/time-invalid-am_michael.wav'])
    expect(lapTimeAnnouncementPaths(Number.NaN, true, 'af_heart')).toEqual([])
  })
})

describe('PIP-667 every runtime clip exists for all four voices', () => {
  const qualifying = (name: string) => resolve(root, 'public/voice/qualifying', name)
  const missing: string[] = []
  for (const voice of VOICE_IDS) {
    for (const s of voiceScript.scenarios) if (!existsSync(qualifying(`${s.id}-${voice}.wav`))) missing.push(`${s.id}-${voice}`)
    for (const s of voiceScript.steps) {
      const name = `step-${s.trainingId}-${s.modeId}-${s.stepId}-${voice}.wav`
      if (!existsSync(qualifying(name))) missing.push(name)
    }
    for (const p of coachScript.phrases) if (!existsSync(resolve(root, 'public/voice/coach', `${p.key}-${voice}.wav`))) missing.push(`coach ${p.key}-${voice}`)
    for (let tenths = 800; tenths <= 1509; tenths += 1) {
      if (!existsSync(qualifying(`lap-time-${String(tenths).padStart(4, '0')}-${voice}.wav`))) missing.push(`lap-time-${tenths}-${voice}`)
    }
    if (!existsSync(qualifying(`time-invalid-${voice}.wav`))) missing.push(`time-invalid-${voice}`)
    for (const point of trackPoints.points as Array<{ id: string, audio_paths?: Record<string, string> }>) {
      const path = point.audio_paths?.[voice]
      if (!path || !existsSync(resolve(root, 'public', path.replace(/^\//, '')))) missing.push(`reference ${point.id}-${voice}`)
    }
  }

  it('no missing WAV', () => {
    expect(missing.slice(0, 20)).toEqual([])
  })

  it('every phrase and Spa point has its English text', () => {
    expect(voiceScript.scenarios.filter(s => !s.textEn?.trim()).map(s => s.id)).toEqual([])
    expect(voiceScript.steps.filter(s => !s.textEn?.trim()).map(s => s.stepId)).toEqual([])
    expect(coachScript.phrases.filter(p => (p.textEn ?? '').split(/\s+/).filter(Boolean).length < 3).map(p => p.key)).toEqual([])
    expect((trackPoints.points as Array<{ id: string, text_en?: string }>).filter(p => !p.text_en?.trim()).map(p => p.id)).toEqual([])
  })
})
