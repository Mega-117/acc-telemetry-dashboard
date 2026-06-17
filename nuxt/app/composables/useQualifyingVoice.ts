import { ref } from 'vue'
import {
  getRandomQualifyingVoicePhrase,
  getQualifyingVoiceAudioPath,
  getStepStartAudioPath,
  type QualifyingVoicePhrase,
  type QualifyingVoiceScenario,
  type QualifyingVoiceId,
} from '~/config/qualifyingVoiceNotifications'
import { resolveLapTimeVoiceEntry } from '~/services/overlay/lapTimeAnnouncer'

/**
 * @description Manages the qualifying voice notification system: queues audio phrases for
 * scenario-based notifications (lap-time comparisons, improvement cues, etc.), primes the
 * Web Audio API context after user gesture, and plays step-done sound effects.
 * @param getPublicPath - Resolves a relative asset path to an absolute public URL.
 * @param selectedVoiceId - Returns the currently selected voice pack id.
 * @param isSoundEnabled - Returns whether audio feedback is enabled.
 * @param selectedTrainingId - Returns the active training overlay id (used to scope notifications).
 * @returns Object with soundEnabled ref, enqueueVoice, stopVoice, primeStepAudio, playStepDoneSound functions.
 */
export function useQualifyingVoice(
  getPublicPath: (p: string) => string,
  selectedVoiceId: () => QualifyingVoiceId,
  isSoundEnabled: () => boolean,
  selectedTrainingId: () => string,
) {
  let audio: HTMLAudioElement | null = null
  let queue = Promise.resolve()
  let generation = 0
  let stepAudioContext: AudioContext | null = null
  const soundEnabled = ref(isSoundEnabled())

  function getStepAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return null
    if (!stepAudioContext) stepAudioContext = new Ctor()
    return stepAudioContext
  }

  async function primeStepAudio() {
    if (!soundEnabled.value) return
    const ctx = getStepAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  }

  function playStepDoneSound() {
    if (!soundEnabled.value) return
    const ctx = getStepAudioContext()
    if (!ctx) return
    void ctx.resume().catch(() => undefined)
    const firstBeepAt = ctx.currentTime + 0.01
    const base = [0, 0.22, 0.44]
    const offsets = [...base, ...base.map(o => o + 0.95), ...base.map(o => o + 1.90)]
    offsets.forEach((offset) => {
      const t = firstBeepAt + offset
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(980, t)
      osc.frequency.exponentialRampToValueAtTime(760, t + 0.14)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.38, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.18)
    })
  }

  // Bip countdown "da palestra" (PIP-97): corto e piano a -3/-2, lungo su 1.
  function playCountdownBeep(final = false) {
    if (!soundEnabled.value) return
    const ctx = getStepAudioContext()
    if (!ctx) return
    void ctx.resume().catch(() => undefined)
    const t = ctx.currentTime + 0.01
    const duration = final ? 0.45 : 0.1
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(final ? 1180 : 880, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(final ? 0.32 : 0.16, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  }

  function isEnabled() {
    return soundEnabled.value && typeof window !== 'undefined'
  }

  function playPhrase(phrase: QualifyingVoicePhrase, gen: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!isEnabled() || gen !== generation) { resolve(); return }
      const voice = selectedVoiceId() || phrase.voice
      const el = new Audio(getPublicPath(getQualifyingVoiceAudioPath(phrase.scenario, voice)))
      audio = el
      el.onended = () => { if (audio === el) audio = null; resolve() }
      el.onerror = () => { if (audio === el) audio = null; resolve() }
      void el.play().catch(() => { if (audio === el) audio = null; resolve() })
    })
  }

  function stopVoice() {
    generation += 1
    if (audio) { audio.pause(); audio.currentTime = 0; audio = null }
    queue = Promise.resolve()
  }

  function enqueue(scenario: QualifyingVoiceScenario, opts: { replace?: boolean } = {}) {
    if (!isEnabled()) return
    const phrase = getRandomQualifyingVoicePhrase(scenario)
    if (!phrase) return
    if (opts.replace) stopVoice()
    const gen = generation
    queue = queue.then(() => playPhrase(phrase, gen))
  }

  /** Plays the pre-generated WAV intro for a specific training+step id combo. */
  function enqueueStepStart(trainingId: string, stepId: string) {
    if (!isEnabled()) return
    const voice = selectedVoiceId()
    const path = getPublicPath(getStepStartAudioPath(trainingId, stepId, voice))
    const gen = generation
    queue = queue.then(() => new Promise<void>((resolve) => {
      if (!soundEnabled.value || gen !== generation) { resolve(); return }
      const el = new Audio(path)
      audio = el
      el.onended = () => { if (audio === el) audio = null; resolve() }
      el.onerror = () => { if (audio === el) audio = null; resolve() }
      void el.play().catch(() => { if (audio === el) audio = null; resolve() })
    }))
  }

  function playAudioPath(path: string, gen: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!soundEnabled.value || gen !== generation) { resolve(false); return }
      const el = new Audio(path)
      audio = el
      el.onended = () => { if (audio === el) audio = null; resolve(true) }
      el.onerror = () => { if (audio === el) audio = null; resolve(false) }
      void el.play().catch(() => { if (audio === el) audio = null; resolve(false) })
    })
  }

  /**
   * Announces a lap crossing. PIP-155 prefers one full pre-generated WAV
   * ("uno, quarantanove, punto tre") so Kokoro never has to pronounce short
   * isolated bricks while driving. If the full WAV is missing/out of range,
   * it stays silent instead of falling back to lower-quality audio bricks.
   */
  function announceLap(_lapNum: number, timeMs: number | null, valid: boolean) {
    if (!isEnabled()) return
    const voice = selectedVoiceId()
    const fullLapAudio = resolveLapTimeVoiceEntry(timeMs, valid, voice)
    if (!fullLapAudio) return
    // Sostituisce eventuali annunci precedenti: sul traguardo conta l'ultimo.
    stopVoice()
    const gen = generation
    queue = queue.then(async () => {
      if (fullLapAudio) {
        await playAudioPath(getPublicPath(fullLapAudio.path), gen)
      }
    })
  }

  return { soundEnabled, primeStepAudio, playStepDoneSound, playCountdownBeep, enqueue, enqueueStepStart, announceLap, stopVoice, getStepAudioContext }
}
