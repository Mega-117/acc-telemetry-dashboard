import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { useSessionOrchestrator } from '~/composables/useSessionOrchestrator'

type Phase = 'loading' | 'placement' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'

function makeStep(id: string, durationMinutes: number) {
  return { id, title: id, durationMinutes, type: 'work' as const, hud: id, voiceIntro: id }
}

function setup(opts: { autoAdvance?: boolean, seconds?: number, canAdvance?: boolean } = {}) {
  const phase = ref<Phase>('select')
  const activeStepIndex = ref(0)
  const remainingMs = ref(0)
  const mode = {
    id: 'short30' as const,
    title: '30 min',
    duration: 30,
    description: '',
    steps: [makeStep('step-a', 1), makeStep('step-b', 1), makeStep('step-c', 1)],
  }
  const noop = () => {}
  const asyncNoop = async () => {}
  const stopLiveStatePolling = vi.fn()
  const trackingComplete = vi.fn(asyncNoop)
  const playCountdownBeep = vi.fn()
  const isSettingsOpen = ref(false)

  const orchestrator = useSessionOrchestrator(
    phase as never,
    activeStepIndex,
    remainingMs,
    ref('tracktitan_input') as never,
    ref('short30') as never,
    isSettingsOpen,
    computed(() => mode) as never,
    computed(() => opts.canAdvance ?? true),
    ref(opts.autoAdvance ?? true),
    ref(opts.seconds ?? 10),
    noop, noop, noop, noop, noop,
    asyncNoop, noop, noop, playCountdownBeep,
    ref({ currentLap: null, lapValid: null, lapsCompleted: null, lapsValid: null }),
    noop, stopLiveStatePolling, noop,
    asyncNoop, trackingComplete as never, asyncNoop, asyncNoop,
  )

  return { phase, activeStepIndex, remainingMs, orchestrator, stopLiveStatePolling, trackingComplete, playCountdownBeep, isSettingsOpen }
}

describe('useSessionOrchestrator - countdown auto-advance', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('a scadenza naturale mostra il countdown e avanza allo step successivo a zero', async () => {
    const { phase, activeStepIndex, orchestrator } = setup({ seconds: 10 })
    orchestrator.startStep(0)
    expect(phase.value).toBe('running')

    vi.advanceTimersByTime(60_000)
    expect(phase.value).toBe('expired')
    await nextTick()
    expect(orchestrator.autoAdvanceRemainingSec.value).toBe(10)

    vi.advanceTimersByTime(5_000)
    expect(orchestrator.autoAdvanceRemainingSec.value).toBe(5)

    vi.advanceTimersByTime(5_000)
    expect(phase.value).toBe('running')
    expect(activeStepIndex.value).toBe(1)
    expect(orchestrator.autoAdvanceRemainingSec.value).toBeNull()
  })

  it('cancelAutoAdvance ferma il countdown e resta in expired', async () => {
    const { phase, orchestrator } = setup({ seconds: 10 })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(orchestrator.autoAdvanceRemainingSec.value).toBe(10)

    orchestrator.cancelAutoAdvance()
    expect(orchestrator.autoAdvanceRemainingSec.value).toBeNull()

    vi.advanceTimersByTime(30_000)
    expect(phase.value).toBe('expired')
  })

  it('bip da palestra sul countdown: corti a 3 e 2, lungo a 1 (PIP-97)', async () => {
    const { orchestrator, playCountdownBeep } = setup({ seconds: 5 })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(orchestrator.autoAdvanceRemainingSec.value).toBe(5)

    vi.advanceTimersByTime(1_000) // 4
    expect(playCountdownBeep).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000) // 3
    expect(playCountdownBeep).toHaveBeenNthCalledWith(1, false)
    vi.advanceTimersByTime(1_000) // 2
    expect(playCountdownBeep).toHaveBeenNthCalledWith(2, false)
    vi.advanceTimersByTime(1_000) // 1
    expect(playCountdownBeep).toHaveBeenNthCalledWith(3, true)
    expect(playCountdownBeep).toHaveBeenCalledTimes(3)
  })

  it('annullando il countdown i bip si fermano', async () => {
    const { orchestrator, playCountdownBeep } = setup({ seconds: 10 })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(60_000)
    await nextTick()
    orchestrator.cancelAutoAdvance()
    vi.advanceTimersByTime(10_000)
    expect(playCountdownBeep).not.toHaveBeenCalled()
  })

  it('startSession e resetCompleted chiudono il pannello impostazioni (PIP-97)', () => {
    const { orchestrator, isSettingsOpen } = setup()
    isSettingsOpen.value = true
    orchestrator.startSession()
    expect(isSettingsOpen.value).toBe(false)

    isSettingsOpen.value = true
    orchestrator.resetCompleted()
    expect(isSettingsOpen.value).toBe(false)
  })

  it('con avanzamento auto disattivato non parte alcun countdown', async () => {
    const { phase, orchestrator } = setup({ autoAdvance: false })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(phase.value).toBe('expired')
    expect(orchestrator.autoAdvanceRemainingSec.value).toBeNull()

    vi.advanceTimersByTime(60_000)
    expect(phase.value).toBe('expired')
  })
})

describe('useSessionOrchestrator - completamento manuale e skip', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('completeCurrentStep avanza direttamente senza passare per expired', () => {
    const { phase, activeStepIndex, orchestrator } = setup({ canAdvance: true })
    orchestrator.startStep(0)
    orchestrator.completeCurrentStep()
    expect(phase.value).toBe('running')
    expect(activeStepIndex.value).toBe(1)
  })

  it('completeCurrentStep non fa nulla se lo step non e manualmente avanzabile', () => {
    const { phase, activeStepIndex, orchestrator } = setup({ canAdvance: false })
    orchestrator.startStep(0)
    orchestrator.completeCurrentStep()
    expect(phase.value).toBe('running')
    expect(activeStepIndex.value).toBe(0)
  })

  it('skipPausedStep avanza solo dalla pausa', () => {
    const { phase, activeStepIndex, orchestrator } = setup()
    orchestrator.startStep(0)

    orchestrator.skipPausedStep()
    expect(activeStepIndex.value).toBe(0)

    orchestrator.pauseSession()
    expect(phase.value).toBe('paused')
    orchestrator.skipPausedStep()
    expect(phase.value).toBe('running')
    expect(activeStepIndex.value).toBe(1)
  })

  it('skipPausedStep sull ultimo step chiude la sessione come completata', () => {
    const { phase, orchestrator } = setup()
    orchestrator.startStep(2)
    orchestrator.pauseSession()
    orchestrator.skipPausedStep()
    expect(phase.value).toBe('completed')
  })
})

describe('useSessionOrchestrator - registrazione completamento (PIP-95)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('goNextStep sull ultimo step registra la sessione e ferma il polling', () => {
    const { phase, orchestrator, trackingComplete, stopLiveStatePolling } = setup()
    orchestrator.startStep(2)
    orchestrator.goNextStep()
    expect(phase.value).toBe('completed')
    expect(trackingComplete).toHaveBeenCalledWith(3)
    expect(stopLiveStatePolling).toHaveBeenCalled()
  })

  it('auto-advance sull ultimo step registra la sessione', async () => {
    const { phase, orchestrator, trackingComplete, stopLiveStatePolling } = setup({ seconds: 5 })
    orchestrator.startStep(2)
    vi.advanceTimersByTime(60_000)
    expect(phase.value).toBe('expired')
    await nextTick()
    vi.advanceTimersByTime(5_000)
    expect(phase.value).toBe('completed')
    expect(trackingComplete).toHaveBeenCalledWith(3)
    expect(stopLiveStatePolling).toHaveBeenCalled()
  })

  it('completeCurrentStep sull ultimo step registra la sessione', () => {
    const { phase, orchestrator, trackingComplete } = setup({ canAdvance: true })
    orchestrator.startStep(2)
    orchestrator.completeCurrentStep()
    expect(phase.value).toBe('completed')
    expect(trackingComplete).toHaveBeenCalledWith(3)
  })

  it('skipPausedStep sull ultimo step registra la sessione', () => {
    const { orchestrator, trackingComplete, stopLiveStatePolling } = setup()
    orchestrator.startStep(2)
    orchestrator.pauseSession()
    orchestrator.skipPausedStep()
    expect(trackingComplete).toHaveBeenCalledWith(3)
    expect(stopLiveStatePolling).toHaveBeenCalled()
  })

  it('lo stop manuale NON registra come completata (resta trackingAbandon)', () => {
    const { phase, orchestrator, trackingComplete } = setup()
    orchestrator.startStep(1)
    orchestrator.stopSession()
    expect(phase.value).toBe('select')
    expect(trackingComplete).not.toHaveBeenCalled()
  })
})
