import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { readCommonLive, RUNNING_TTL_MS, type CommonLive } from '~/services/telemetry/commonLive'
import { simulatorConnection } from '~/services/telemetry/gameCatalog'
import { GAME_CLOSED_GRACE_MS, SILENCE_GRACE_MS, useSimulatorPresence } from '~/composables/useSimulatorPresence'
import { setLocale } from '~/i18n'

// Italian assertions (jsdom defaults to English).
setLocale('it')

const NOW = 1_000_000
const frame = (extra: Record<string, unknown> = {}) => ({ schema: 'racercore.live', version: 1, game_id: 'acc', session_id: null,
  observed_at_ms: NOW, ttl_ms: 5000, connected: false, lifecycle: 'off', capabilities: {},
  fields: { hud_driving: { value: null, availability: 'unknown', unit: 'boolean' } }, ...extra })

describe('PIP-510 simulator connection', () => {
  it('reads the running heartbeat and the choice flag from the logger frame', () => {
    expect(readCommonLive(frame({ running: true, running_at_ms: NOW }), NOW)!.running).toBe(true)
    expect(readCommonLive(frame({ running: true, running_at_ms: NOW - RUNNING_TTL_MS - 1 }), NOW)!.running).toBe(false)
    expect(readCommonLive(frame({ running: true }), NOW)!.running).toBe(false)
    expect(readCommonLive(frame({ game_id: 'unknown', choice_required: true }), NOW)!.choiceRequired).toBe(true)
  })
  it('distinguishes connected, started, choice and none with one rule', () => {
    expect(simulatorConnection({ gameId: 'acc', connected: true, fresh: true })).toMatchObject({ state: 'connected', label: 'Collegato: ACC' })
    expect(simulatorConnection({ gameId: 'acc', connected: false, fresh: true, running: true })).toMatchObject({ state: 'started', label: 'ACC avviato', gameId: 'acc' })
    expect(simulatorConnection({ gameId: 'evo', connected: false, fresh: false, running: true })).toMatchObject({ state: 'started', label: 'Assetto Corsa EVO avviato' })
    expect(simulatorConnection({ gameId: 'foreign', connected: false, fresh: true, running: true }).state).toBe('none')
    expect(simulatorConnection({ gameId: 'unknown', connected: false, fresh: true, choiceRequired: true })).toMatchObject({ state: 'choice', label: 'Scegli il gioco' })
    expect(simulatorConnection(null)).toMatchObject({ state: 'none', label: 'Nessun gioco collegato' })
  })
  it('shows the label in the interface language while the state stays the same', () => {
    setLocale('en')
    try {
      expect(simulatorConnection({ gameId: 'acc', connected: true, fresh: true })).toMatchObject({ state: 'connected', label: 'Connected: ACC' })
      expect(simulatorConnection({ gameId: 'acc', connected: false, fresh: true, running: true })).toMatchObject({ state: 'started', label: 'ACC running' })
      expect(simulatorConnection(null)).toMatchObject({ state: 'none', label: 'No game connected' })
    } finally {
      setLocale('it')
    }
  })
})

describe('PIP-510 Ctrl+K simulator presence', () => {
  function setup() {
    let clock = NOW
    const timers: Array<{ at: number; run: () => void }> = []
    const live = ref<CommonLive | null>(null)
    const scope = effectScope()
    const presence = scope.run(() => useSimulatorPresence(live, {
      now: () => clock,
      setTimer: ((run: () => void, delay: number) => { const timer = { at: clock + delay, run }; timers.push(timer); return timer }) as unknown as typeof setTimeout,
      clearTimer: ((timer: unknown) => { const index = timers.indexOf(timer as never); if (index >= 0) timers.splice(index, 1) }) as typeof clearTimeout,
    }))!
    const advance = async (ms: number) => {
      clock += ms
      for (const timer of [...timers].filter(t => t.at <= clock)) { timers.splice(timers.indexOf(timer), 1); timer.run() }
      await nextTick()
    }
    const set = async (raw: Record<string, unknown> | null) => { live.value = raw ? readCommonLive(raw, clock) : null; await nextTick() }
    return { presence, advance, set, scope }
  }

  it('shows the game layout from the menus, before any driving data', async () => {
    const { presence, set } = setup()
    expect(presence.gameId.value).toBeNull()
    await set(frame({ running: true, running_at_ms: NOW }))
    expect(presence.gameId.value).toBe('acc')
    expect(presence.connection.value.state).toBe('started')
  })
  it('resets 3 s after the logger reports the game closed, not earlier', async () => {
    const { presence, set, advance } = setup()
    await set(frame({ connected: true }))
    await set(frame({ game_id: 'unknown' }))
    expect(presence.gameId.value).toBe('acc')
    await advance(GAME_CLOSED_GRACE_MS - 1)
    expect(presence.gameId.value).toBe('acc')
    await advance(1)
    expect(presence.gameId.value).toBeNull()
  })
  it('keeps the layout through a silent source (app stall) and the game coming back', async () => {
    const { presence, set, advance } = setup()
    await set(frame({ connected: true }))
    await set(null)
    await advance(SILENCE_GRACE_MS - 1)
    expect(presence.gameId.value).toBe('acc')
    await set(frame({ connected: true, observed_at_ms: NOW + SILENCE_GRACE_MS - 1 }))
    await advance(SILENCE_GRACE_MS)
    expect(presence.gameId.value).toBe('acc')
  })
  it('asks to choose in the webapp only when no game is shown', async () => {
    const { presence, set, advance } = setup()
    await set(frame({ game_id: 'unknown', choice_required: true }))
    expect(presence.choiceRequired.value).toBe(true)
    await set(frame({ running: true, running_at_ms: NOW }))
    expect(presence.choiceRequired.value).toBe(false)
    await set(frame({ game_id: 'unknown', choice_required: true }))
    expect(presence.choiceRequired.value).toBe(false)   // still holding ACC for 3 s
    await advance(GAME_CLOSED_GRACE_MS)
    expect(presence.choiceRequired.value).toBe(true)
  })
})
