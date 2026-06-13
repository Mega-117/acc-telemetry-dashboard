import { computed, ref } from 'vue'

/**
 * useDevTestMode (PIP-106)
 * ========================
 * Mattoncino condiviso per la "test-mode" di sviluppo: accorcia il cronometro
 * di ogni step a un budget fisso (~90s reali, a velocità normale) per provare
 * l'overlay senza aspettare i timer veri.
 *
 * Principio chiave: NON cambia l'identità dello step. Comprime solo il *budget
 * del cronometro*; le decisioni "saltabile" (durata ≤5min) e "avviso ultimo
 * minuto" (durata ≥5min) restano calcolate sulla durata REALE. La sorgente del
 * budget (`stepBudgetMs`) è una sola, condivisa da timer + barra + auto-dim.
 *
 * Stato singleton a livello di modulo: così il toggle, il badge e
 * l'orchestratore nella stessa finestra vedono lo stesso flag.
 *
 * Sicurezza: tutto è gated da `import.meta.dev`. In produzione `isTestMode` è
 * sempre false e init/toggle sono no-op, quindi nessun badge e nessun effetto.
 */

const STORAGE_KEY = 'overlay-dev-test-mode'
const STORAGE_KEY_BUDGET = 'overlay-dev-test-mode-budget'
const DEFAULT_BUDGET_SECONDS = 90
// Sotto questa soglia l'"ultimo minuto" (cue a T-60s) non sarebbe testabile.
const MIN_USEFUL_BUDGET_SECONDS = 75

interface StepLike { durationMinutes: number }

// ── Stato condiviso (singleton) ────────────────────────────────────────────
const isTestMode = ref(false)
const stepBudgetSeconds = ref(DEFAULT_BUDGET_SECONDS)
let initialized = false

export function useDevTestMode() {
  function init() {
    if (!import.meta.dev || typeof window === 'undefined' || initialized) return
    initialized = true
    try {
      isTestMode.value = window.localStorage.getItem(STORAGE_KEY) === 'true'
      const savedBudget = Number(window.localStorage.getItem(STORAGE_KEY_BUDGET))
      if (Number.isFinite(savedBudget) && savedBudget > 0) stepBudgetSeconds.value = savedBudget
    } catch (e) {
      console.warn('[TEST-MODE] init error:', e)
    }
  }

  function persist() {
    if (typeof window === 'undefined') return
    try {
      if (isTestMode.value) window.localStorage.setItem(STORAGE_KEY, 'true')
      else window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.setItem(STORAGE_KEY_BUDGET, String(stepBudgetSeconds.value))
    } catch (e) {
      console.warn('[TEST-MODE] persist error:', e)
    }
  }

  function toggle() {
    if (!import.meta.dev) return
    isTestMode.value = !isTestMode.value
    persist()
    console.info(isTestMode.value
      ? `[TEST MODE] ON — budget step ${stepBudgetSeconds.value}s`
      : '[TEST MODE] OFF — tempi reali')
  }

  /**
   * Budget del cronometro per lo step, in ms. UNICA sorgente: usata dal timer
   * (orchestratore), dalla barra di avanzamento e dall'auto-dim.
   */
  function stepBudgetMs(step: StepLike): number {
    if (isTestMode.value) return stepBudgetSeconds.value * 1000
    return step.durationMinutes * 60_000
  }

  const badgeLabel = computed(() => `TEST ${stepBudgetSeconds.value}s`)

  return {
    isTestMode,
    stepBudgetSeconds,
    badgeLabel,
    init,
    toggle,
    stepBudgetMs,
    MIN_USEFUL_BUDGET_SECONDS,
  }
}
