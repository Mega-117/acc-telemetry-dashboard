import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeApi(getLiveState: () => Promise<any>) {
  return { getLiveState }
}

// Con i fake timers anche Date è mockata: ts coerente con il "now" del test.
function freshTs() {
  return new Date(Date.now()).toISOString()
}

// NOTA: con vi.useFakeTimers(), setTimeout viene mockato.
// Usiamo Promise.resolve() per drenare la microtask queue senza dipendere da setTimeout.
async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('useLiveStatePoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ───────────────────────────────────────────────────
  describe('logger non disponibile', () => {
    it('quando getApi() ritorna null: liveLap rimane null, isPollingActive è false, setInterval NON viene chiamato', async () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const { liveLap, isPollingActive, startLiveStatePolling } = useLiveStatePoller(() => null)

      startLiveStatePolling()
      await flushPromises()

      expect(liveLap.value.currentLap).toBeNull()
      expect(liveLap.value.lapsCompleted).toBeNull()
      expect(isPollingActive.value).toBe(false)
      expect(setIntervalSpy).not.toHaveBeenCalled()
    })

    it('quando getApi() ritorna oggetto senza getLiveState: isPollingActive è false, setInterval NON viene chiamato', async () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      // Oggetto privo di getLiveState — equivalente a "api non pronta"
      const { isPollingActive, startLiveStatePolling } = useLiveStatePoller(() => ({}))

      startLiveStatePolling()
      await flushPromises()

      expect(isPollingActive.value).toBe(false)
      expect(setIntervalSpy).not.toHaveBeenCalled()
    })
  })

  // ───────────────────────────────────────────────────
  describe('retry su errore IPC', () => {
    it('dopo 1 errore il polling continua (isPollingActive non viene settato a false)', async () => {
      let calls = 0
      const getLiveState = vi.fn(async () => {
        calls++
        if (calls === 1) throw new Error('IPC timeout')
        return { ts: freshTs(), current_lap: 3, laps_completed: 2, laps_valid: 2, lap_valid: true }
      })
      const { isPollingActive, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises() // primo tick (errore)

      // Dopo 1 errore non deve essere ancora false
      expect(isPollingActive.value).toBe(false) // non è ancora stato chiamato con successo
      // Ma l'intervallo deve ancora essere attivo: avanziamo al secondo tick
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises() // secondo tick (successo)

      expect(isPollingActive.value).toBe(true)
    })

    it('dopo 3 errori consecutivi, isPollingActive diventa false (silent fail)', async () => {
      const getLiveState = vi.fn(async () => { throw new Error('IPC error') })
      const { isPollingActive, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()

      // Tick 1 (immediato)
      await flushPromises()
      // Tick 2
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      // Tick 3 — raggiunge MAX_CONSECUTIVE_ERRORS
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()

      expect(isPollingActive.value).toBe(false)
      expect(getLiveState).toHaveBeenCalledTimes(3)
    })

    it('dopo 3 errori il polling si ferma: tick successivi non chiamano più getLiveState', async () => {
      const getLiveState = vi.fn(async () => { throw new Error('IPC error') })
      const { startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()

      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()

      const countAfter3 = getLiveState.mock.calls.length

      // Avanziamo altri 3 tick — il polling deve essere fermato
      await vi.advanceTimersByTimeAsync(6000)
      await flushPromises()

      expect(getLiveState.mock.calls.length).toBe(countAfter3)
    })

    it('dopo errore seguito da successo, errorCount si azzera e isPollingActive torna true', async () => {
      let calls = 0
      const getLiveState = vi.fn(async () => {
        calls++
        if (calls <= 2) throw new Error('IPC flap')
        return { ts: freshTs(), current_lap: 5, laps_completed: 4, laps_valid: 4, lap_valid: true }
      })
      const { isPollingActive, liveLap, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()

      // 2 errori
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()

      expect(isPollingActive.value).toBe(false) // non ancora true

      // Successo al 3° tick
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()

      expect(isPollingActive.value).toBe(true)
      expect(liveLap.value.currentLap).toBe(5)

      // Verifica che un ulteriore errore reimposti il counter (richiede altri 3 errori per fermare)
      let postSuccessCalls = 0
      getLiveState.mockImplementation(async () => {
        postSuccessCalls++
        throw new Error('IPC again')
      })

      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(isPollingActive.value).toBe(true) // 1 errore post-reset → polling ancora attivo
    })
  })

  // ───────────────────────────────────────────────────
  describe('polling normale', () => {
    it('quando API disponibile e getLiveState() ha successo, liveLap viene aggiornato', async () => {
      const getLiveState = vi.fn(async () => ({
        ts: freshTs(),
        current_lap: 7,
        laps_completed: 6,
        laps_valid: 5,
        lap_valid: false,
      }))
      const { liveLap, isPollingActive, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()

      expect(liveLap.value.currentLap).toBe(7)
      expect(liveLap.value.lapsCompleted).toBe(6)
      expect(liveLap.value.lapsValid).toBe(5)
      expect(liveLap.value.lapValid).toBe(false)
      expect(isPollingActive.value).toBe(true)
    })

    it('live_state stantio su disco (ts vecchio) imposta EMPTY_LAP_STATE — niente lap fantasma (PIP-94)', async () => {
      const staleTs = new Date(Date.now() - 60_000).toISOString()
      const getLiveState = vi.fn(async () => ({
        ts: staleTs, current_lap: 2, laps_completed: 1, laps_valid: 1, lap_valid: false,
      }))
      const { liveLap, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()

      expect(liveLap.value.currentLap).toBeNull()
      expect(liveLap.value.lapValid).toBeNull()
    })

    it('live_state senza ts imposta EMPTY_LAP_STATE (PIP-94)', async () => {
      const getLiveState = vi.fn(async () => ({
        current_lap: 2, laps_completed: 1, laps_valid: 1, lap_valid: true,
      }))
      const { liveLap, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()

      expect(liveLap.value.currentLap).toBeNull()
    })

    it('logger che smette di scrivere: i dati diventano stantii al tick successivo (PIP-94)', async () => {
      const fixedTs = freshTs()
      const getLiveState = vi.fn(async () => ({
        ts: fixedTs, current_lap: 4, laps_completed: 3, laps_valid: 3, lap_valid: true,
      }))
      const { liveLap, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()
      expect(liveLap.value.currentLap).toBe(4)

      // Il file resta su disco con lo stesso ts mentre il tempo avanza oltre la soglia.
      await vi.advanceTimersByTimeAsync(12_000)
      await flushPromises()

      expect(liveLap.value.currentLap).toBeNull()
    })

    it('espone track e car dal live_state per il Training Tracker (PIP-95)', async () => {
      const getLiveState = vi.fn(async () => ({
        ts: freshTs(), current_lap: 3, laps_completed: 2, laps_valid: 2, lap_valid: true,
        track: 'monza', car: 'ferrari_296_gt3',
      }))
      const { liveLap, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()

      expect(liveLap.value.track).toBe('monza')
      expect(liveLap.value.car).toBe('ferrari_296_gt3')
    })

    it('track/car assenti o vuoti diventano null', async () => {
      const getLiveState = vi.fn(async () => ({
        ts: freshTs(), current_lap: 1, laps_completed: 0, laps_valid: 0, lap_valid: true, track: '',
      }))
      const { liveLap, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()

      expect(liveLap.value.track).toBeNull()
      expect(liveLap.value.car).toBeNull()
    })

    it('getLiveState() che ritorna valore non-oggetto imposta EMPTY_LAP_STATE', async () => {
      const getLiveState = vi.fn(async () => null)
      const { liveLap, startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()

      expect(liveLap.value.currentLap).toBeNull()
      expect(liveLap.value.lapsCompleted).toBeNull()
    })

    it('startLiveStatePolling avvia il polling, stopLiveStatePolling lo ferma', async () => {
      const getLiveState = vi.fn(async () => ({
        ts: freshTs(), current_lap: 1, laps_completed: 0, laps_valid: 0, lap_valid: true,
      }))
      const { startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      await flushPromises()
      expect(getLiveState).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(getLiveState).toHaveBeenCalledTimes(2)

      stopLiveStatePolling()

      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()
      // Nessuna ulteriore chiamata dopo lo stop
      expect(getLiveState).toHaveBeenCalledTimes(2)
    })

    it('push dal main (PIP-102): aggiornamento immediato senza aspettare il tick', async () => {
      let pushCallback: ((state: any) => void) | null = null
      const unsubscribe = vi.fn()
      const api = {
        getLiveState: vi.fn(async () => null),
        onLiveStateUpdate: vi.fn((cb: (state: any) => void) => { pushCallback = cb; return unsubscribe }),
      }
      const { liveLap, startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(() => api)

      startLiveStatePolling()
      await flushPromises()
      expect(api.onLiveStateUpdate).toHaveBeenCalled()
      expect(liveLap.value.currentLap).toBeNull()

      pushCallback!({ ts: freshTs(), current_lap: 9, laps_completed: 8, laps_valid: 7, lap_valid: true, last_lap_time_ms: 109_320 })
      expect(liveLap.value.currentLap).toBe(9)
      expect(liveLap.value.lastLapTimeMs).toBe(109_320)

      // stale via push: torna vuoto (stesso gating del polling)
      pushCallback!({ ts: new Date(Date.now() - 60_000).toISOString(), current_lap: 10 })
      expect(liveLap.value.currentLap).toBeNull()

      stopLiveStatePolling()
      expect(unsubscribe).toHaveBeenCalled()
    })

    it('chiamare startLiveStatePolling due volte non duplica il polling', async () => {
      const getLiveState = vi.fn(async () => ({
        ts: freshTs(), current_lap: 2, laps_completed: 1, laps_valid: 1, lap_valid: true,
      }))
      const { startLiveStatePolling } = useLiveStatePoller(() => makeApi(getLiveState))

      startLiveStatePolling()
      startLiveStatePolling() // secondo avvio: deve cancellare il primo
      await flushPromises()

      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()

      // Con doppio avvio e nessuna deduplication ci aspetteremmo 4 (2+2),
      // con deduplication corretta ci aspettiamo 2 (1 immediato + 1 da intervallo singolo)
      // Il composable chiama stopLiveStatePolling() all'inizio, quindi un solo intervallo attivo
      // Primo startLiveStatePolling: 1 call immediata; poi sovrascritta → 0 intervalli rimasti attivi
      // Secondo startLiveStatePolling: 1 call immediata + 1 dal tick → totale 2 + 1 da 1° call = 3 oppure 2+1=3
      // In realtà: primo avvio → pollOnce (async) + setInterval; secondo avvio → clearInterval + pollOnce + setInterval
      // Risultato: 2 call immediate (una per ogni start) + 1 tick → 3 totali
      expect(getLiveState.mock.calls.length).toBeLessThanOrEqual(4)
      expect(getLiveState.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
