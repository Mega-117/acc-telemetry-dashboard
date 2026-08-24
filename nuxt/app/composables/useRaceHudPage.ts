import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'

export type RaceHudPage = 'tyres' | 'damage'
export const RACE_DAMAGE_AUTO_DURATION_MS = 12_000
export const RACE_DAMAGE_FLASH_DURATION_MS = 650

function contextKey(state: FastOverlayState): string {
  const context = state.context
  return [context?.track ?? '', context?.car ?? '', context?.sessionType ?? '', context?.sessionIndex ?? '', context?.sessionUid ?? ''].join('|')
}

export function useRaceHudPage(fastState: Ref<FastOverlayState>) {
  const activePage = ref<RaceHudPage>('tyres')
  const manualDamage = ref(false)
  const damageFlash = ref(false)
  let lastContext = ''
  let lastEventSeq: number | null = null
  let autoTimer: ReturnType<typeof setTimeout> | null = null
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  function clearAutoTimer() {
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = null
  }

  function clearFlashTimer() {
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = null
  }

  function startAutomaticDamage() {
    clearAutoTimer()
    if (!manualDamage.value) activePage.value = 'damage'
    autoTimer = setTimeout(() => {
      autoTimer = null
      if (!manualDamage.value) activePage.value = 'tyres'
    }, RACE_DAMAGE_AUTO_DURATION_MS)
  }

  function startDamageFlash() {
    clearFlashTimer()
    damageFlash.value = true
    flashTimer = setTimeout(() => {
      flashTimer = null
      damageFlash.value = false
    }, RACE_DAMAGE_FLASH_DURATION_MS)
  }

  function selectPage(page: RaceHudPage) {
    clearAutoTimer()
    manualDamage.value = page === 'damage'
    activePage.value = page
  }

  const stopWatch = watch(fastState, (state) => {
    const nextContext = contextKey(state)
    const nextSeq = state.damage?.eventSeq ?? null
    if (!state.isFresh || !state.isLive) {
      clearAutoTimer()
      clearFlashTimer()
      activePage.value = 'tyres'
      manualDamage.value = false
      damageFlash.value = false
      lastContext = nextContext
      lastEventSeq = nextSeq
      return
    }
    if (nextContext !== lastContext || lastEventSeq === null || nextSeq === null || nextSeq < lastEventSeq) {
      lastContext = nextContext
      lastEventSeq = nextSeq
      return
    }
    if (nextSeq > lastEventSeq) {
      lastEventSeq = nextSeq
      startDamageFlash()
      if (!manualDamage.value) startAutomaticDamage()
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    stopWatch()
    clearAutoTimer()
    clearFlashTimer()
  })

  return { activePage, manualDamage, damageFlash, selectPage }
}
