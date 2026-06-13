import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { useSessionOrchestrator } from '~/composables/useSessionOrchestrator'

type Phase = 'loading' | 'placement' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'

function makeStep(id: string, durationMinutes: number) {
  return { id, title: id, durationMinutes, type: 'work' as const, hud: id }
}

function setup(opts: { autoAdvance?: boolean, seconds?: number, canAdvance?: boolean, stepMinutes?: number[], testBudgetMs?: number } = {}) {
  const phase = ref<Phase>('select')
  const activeStepIndex = ref(0)
  const remainingMs = ref(0)
  const minutes = opts.stepMinutes ?? [1, 1, 1]
  const mode = {
    id: 'short30' as const,
    title: '30 min',
    duration: 30,
    description: '',
    steps: minutes.map((m, i) => makeStep(`step-${i}`, m)),
  }
  const noop = () => {}
  const asyncNoop = async () => {}
  const stopLiveStatePolling = vi.fn()
  const trackingComplete = vi.fn(asyncNoop)
  const playCountdownBeep = vi.fn()
  const enqueueVoice = vi.fn()
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
    noop, noop, enqueueVoice as never, noop, noop,
    asyncNoop, noop, noop, playCountdownBeep,
    ref({ currentLap: null, lapValid: null, lapsCompleted: null, lapsValid: null }),
    noop, stopLiveStatePolling, noop,
    asyncNoop, trackingComplete as never, asyncNoop, asyncNoop,
    opts.testBudgetMs != null ? () => opts.testBudgetMs! : undefined,
  )

  return { phase, activeStepIndex, remainingMs, orchestrator, stopLiveStatePolling, trackingComplete, playCountdownBeep, enqueueVoice, isSettingsOpen }
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

describe('useSessionOrchestrator - test-mode budget compresso (PIP-106)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('con budget iniettato 90s uno step reale da 10 min scade a 90s (non 10 min)', () => {
    // Due step: il primo non è l'ultimo, quindi alla scadenza va in expired (PIP-113).
    const { phase, orchestrator } = setup({ stepMinutes: [10, 10], testBudgetMs: 90_000 })
    orchestrator.startStep(0)
    expect(phase.value).toBe('running')

    vi.advanceTimersByTime(89_000)
    expect(phase.value).toBe('running')
    vi.advanceTimersByTime(2_000) // supera 90s
    expect(phase.value).toBe('expired')
  })

  it('identità preservata: su step reale >=5 min il cue "ultimo minuto" scatta comunque (a T-60s del budget)', () => {
    const { orchestrator, enqueueVoice } = setup({ stepMinutes: [10], testBudgetMs: 90_000 })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(29_000) // budget 90s, mancano 61s
    expect(enqueueVoice).not.toHaveBeenCalledWith('lastMinute')
    vi.advanceTimersByTime(2_000) // attraversa T-60s reale
    expect(enqueueVoice.mock.calls.filter(c => c[0] === 'lastMinute')).toHaveLength(1)
  })

  it('identità preservata: su step reale <5 min NESSUN cue, anche se il budget compresso attraversa i 60s', () => {
    const { orchestrator, enqueueVoice } = setup({ stepMinutes: [2], testBudgetMs: 90_000 })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(90_000)
    expect(enqueueVoice).not.toHaveBeenCalledWith('lastMinute')
  })

  it('senza budget iniettato (default) lo step usa la durata reale', () => {
    const { phase, orchestrator } = setup({ stepMinutes: [10, 10] })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(90_000)
    expect(phase.value).toBe('running') // a 90s un 10-min reale non è scaduto
    vi.advanceTimersByTime(10 * 60_000)
    expect(phase.value).toBe('expired')
  })
})

describe('useSessionOrchestrator - ultimo step diretto a completed (PIP-113)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('alla scadenza naturale l ultimo step va diretto a completed (no expired)', () => {
    const { phase, orchestrator, trackingComplete, stopLiveStatePolling } = setup({ stepMinutes: [1] })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(60_000)
    expect(phase.value).toBe('completed')
    expect(trackingComplete).toHaveBeenCalledWith(1)
    expect(stopLiveStatePolling).toHaveBeenCalled()
  })

  it('uno step non-ultimo alla scadenza resta in expired (invariato)', () => {
    const { phase, orchestrator } = setup({ stepMinutes: [1, 1] })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(60_000)
    expect(phase.value).toBe('expired')
  })
})

describe('useSessionOrchestrator - cue ultimo minuto (PIP-99)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('annuncia "ultimo minuto" una sola volta a T-60s sugli step >= 5 minuti', () => {
    const { orchestrator, enqueueVoice } = setup({ stepMinutes: [5] })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(3 * 60_000)
    expect(enqueueVoice).not.toHaveBeenCalledWith('lastMinute')

    vi.advanceTimersByTime(60_000) // T-60s
    expect(enqueueVoice).toHaveBeenCalledWith('lastMinute')
    expect(enqueueVoice.mock.calls.filter(c => c[0] === 'lastMinute')).toHaveLength(1)

    vi.advanceTimersByTime(30_000) // resta una sola
    expect(enqueueVoice.mock.calls.filter(c => c[0] === 'lastMinute')).toHaveLength(1)
  })

  it('non annuncia sugli step brevi (< 5 minuti)', () => {
    const { orchestrator, enqueueVoice } = setup({ stepMinutes: [2] })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(90_000)
    expect(enqueueVoice).not.toHaveBeenCalledWith('lastMinute')
  })

  it('niente doppio annuncio dopo pausa e ripresa a cavallo del minuto', () => {
    const { orchestrator, enqueueVoice } = setup({ stepMinutes: [5] })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(4 * 60_000) // annunciato a T-60
    expect(enqueueVoice.mock.calls.filter(c => c[0] === 'lastMinute')).toHaveLength(1)

    orchestrator.pauseSession()
    vi.advanceTimersByTime(5 * 60_000) // pausa lunga: nessun tick
    orchestrator.resumeSession()
    vi.advanceTimersByTime(10_000)
    expect(enqueueVoice.mock.calls.filter(c => c[0] === 'lastMinute')).toHaveLength(1)
  })

  it('in pausa prima della soglia: annuncio al T-60 reale dopo la ripresa, una volta', () => {
    const { orchestrator, enqueueVoice } = setup({ stepMinutes: [5] })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(3 * 60_000) // restano 2 minuti
    orchestrator.pauseSession()
    vi.advanceTimersByTime(10 * 60_000) // pausa lunga
    expect(enqueueVoice).not.toHaveBeenCalledWith('lastMinute')

    orchestrator.resumeSession()
    vi.advanceTimersByTime(59_000)
    expect(enqueueVoice).not.toHaveBeenCalledWith('lastMinute')
    vi.advanceTimersByTime(2_000) // attraversa T-60 reale
    expect(enqueueVoice.mock.calls.filter(c => c[0] === 'lastMinute')).toHaveLength(1)
  })

  it('lo skip prima della soglia non annuncia; lo step successivo ha il suo trigger', () => {
    const { orchestrator, enqueueVoice } = setup({ stepMinutes: [5, 5], canAdvance: true })
    orchestrator.startStep(0)
    vi.advanceTimersByTime(60_000)
    orchestrator.completeCurrentStep() // skip a meta' step 0
    expect(enqueueVoice).not.toHaveBeenCalledWith('lastMinute')

    vi.advanceTimersByTime(4 * 60_000) // step 1 a T-60
    expect(enqueueVoice.mock.calls.filter(c => c[0] === 'lastMinute')).toHaveLength(1)
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

  it('la scadenza dell ultimo step registra la sessione (diretto a completed, PIP-113)', () => {
    const { phase, orchestrator, trackingComplete, stopLiveStatePolling } = setup()
    orchestrator.startStep(2) // ultimo step di [1,1,1]
    vi.advanceTimersByTime(60_000) // scade -> diretto a completed, niente expired
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
