/**
 * @description Riproduzione audio con watchdog (PIP-254). Le code vocali sono
 * catene di Promise: senza watchdog, un WAV che non emette mai `onended` ne'
 * `onerror` (file corrotto, dispositivo audio rimosso, player in stallo)
 * congela tutti gli annunci successivi per il resto della sessione (bug audit
 * 2026-07-08c). Qui la Promise si risolve SEMPRE: fine naturale, errore, o
 * timeout — e la coda prosegue (degradazione graduale, Principio 5).
 */

/** Margine oltre la durata dichiarata della traccia prima di dichiararla bloccata. */
export const AUDIO_WATCHDOG_MARGIN_S = 5
/** Timeout assoluto quando la durata della traccia non e' (ancora) nota. */
export const AUDIO_WATCHDOG_FALLBACK_S = 30

export type AudioPlaybackOutcome = 'ended' | 'error' | 'timeout'

/**
 * Sottoinsieme strutturale di HTMLAudioElement usato dal watchdog: consente
 * ai test di iniettare un finto elemento audio senza DOM.
 */
export interface PlayableAudio {
  play: () => Promise<void>
  pause: () => void
  readonly duration: number
  // Firme larghe (any) per compatibilita' strutturale con i gestori eventi
  // di HTMLMediaElement, che ricevono l'evento come argomento.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  onended: ((...args: any[]) => any) | null
  onerror: ((...args: any[]) => any) | null
  ondurationchange: ((...args: any[]) => any) | null
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface PlayAudioOptions {
  /** Etichetta per il log diagnostico (di solito il path della traccia). */
  label?: string
  marginS?: number
  fallbackS?: number
  warn?: (message: string) => void
}

/**
 * Avvia la riproduzione e attende la fine con watchdog.
 * Risolve sempre: 'ended' (fine naturale), 'error' (onerror o play rifiutato),
 * 'timeout' (watchdog scattato: la traccia viene messa in pausa e saltata).
 * Il timer si tara sulla durata reale appena il player la conosce
 * (ondurationchange), con fallback assoluto finche' e' ignota.
 */
export function playAudioWithWatchdog(
  el: PlayableAudio,
  options: PlayAudioOptions = {},
): Promise<AudioPlaybackOutcome> {
  const margin = options.marginS ?? AUDIO_WATCHDOG_MARGIN_S
  const fallback = options.fallbackS ?? AUDIO_WATCHDOG_FALLBACK_S
  const warn = options.warn ?? ((message: string) => console.warn(message))

  return new Promise<AudioPlaybackOutcome>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const settle = (outcome: AudioPlaybackOutcome) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(outcome)
    }

    const armWatchdog = () => {
      if (settled) return
      if (timer) clearTimeout(timer)
      const hasDuration = Number.isFinite(el.duration) && el.duration > 0
      const waitS = hasDuration ? el.duration + margin : fallback
      timer = setTimeout(() => {
        try {
          el.pause()
        } catch {
          // pausa best-effort: l'esito e' comunque 'timeout'
        }
        warn(`[audio-watchdog] traccia bloccata oltre ${Math.round(waitS)}s, la salto${options.label ? `: ${options.label}` : ''}`)
        settle('timeout')
      }, waitS * 1000)
    }

    el.onended = () => settle('ended')
    el.onerror = () => settle('error')
    el.ondurationchange = () => armWatchdog()
    armWatchdog()
    void el.play().catch(() => settle('error'))
  })
}
