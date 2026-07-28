import { computed, ref } from 'vue'

export interface TimedHudPagerOptions<Page extends string> {
  defaultPage: Page
  initialPage?: Page
  temporaryDurationMs: number
  progressTickMs?: number
}

/**
 * Stato riusabile per HUD con una pagina principale e pagine temporanee.
 * Il componente consumatore decide quali pagine siano temporanee; qui vivono
 * esclusivamente timer, restart e progresso, senza dipendenze dall'overlay.
 */
export function useTimedHudPager<Page extends string>(options: TimedHudPagerOptions<Page>) {
  const activePage = ref<Page>(options.initialPage ?? options.defaultPage)
  const progress = ref(activePage.value === options.defaultPage ? 0 : 1)
  const temporaryDurationMs = Math.max(1, Number(options.temporaryDurationMs) || 1)
  const progressTickMs = Math.max(16, Number(options.progressTickMs) || 100)
  let deadlineMs: number | null = null
  let expiryTimer: ReturnType<typeof setTimeout> | null = null
  let progressTimer: ReturnType<typeof setInterval> | null = null

  const isTemporaryPage = computed(() => activePage.value !== options.defaultPage)

  function clearTimers() {
    if (expiryTimer) clearTimeout(expiryTimer)
    if (progressTimer) clearInterval(progressTimer)
    expiryTimer = null
    progressTimer = null
    deadlineMs = null
  }

  function returnToDefault() {
    clearTimers()
    activePage.value = options.defaultPage
    progress.value = 0
  }

  function updateProgress() {
    if (deadlineMs === null) return
    progress.value = Math.min(1, Math.max(0, (deadlineMs - Date.now()) / temporaryDurationMs))
  }

  function showTemporary(page: Page) {
    clearTimers()
    activePage.value = page
    progress.value = 1
    deadlineMs = Date.now() + temporaryDurationMs
    progressTimer = setInterval(updateProgress, progressTickMs)
    expiryTimer = setTimeout(returnToDefault, temporaryDurationMs)
  }

  function selectPage(page: Page, temporary = page !== options.defaultPage) {
    if (!temporary || page === options.defaultPage) {
      returnToDefault()
      return
    }
    showTemporary(page)
  }

  function start() {
    if (activePage.value !== options.defaultPage) showTemporary(activePage.value)
  }

  function dispose() {
    clearTimers()
  }

  return {
    activePage,
    progress,
    isTemporaryPage,
    selectPage,
    returnToDefault,
    start,
    dispose,
  }
}
