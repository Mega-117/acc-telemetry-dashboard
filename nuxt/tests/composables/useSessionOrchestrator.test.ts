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

  const orchestrator = useSessionOrchestrator(
    phase as never,
    activeStepIndex,
    remainingMs,
    ref('tracktitan_input') as never,
    ref('short30') as never,
    ref(false),
    computed(() => mode) as never,
    computed(() => opts.canAdvance ?? true),
    ref(opts.autoAdvance ?? true),
    ref(opts.seconds ?? 10),
    noop, noop, noop, noop, noop,
    asyncNoop, noop, noop,
    ref({ currentLap: null, lapValid: null, lapsCompleted: null, lapsValid: null }),
    noop, noop, noop,
    asyncNoop, asyncNoop, asyncNoop, asyncNoop,
  )

  return { phase, activeStepIndex, remainingMs, orchestrator }
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
