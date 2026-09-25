import { computed, getCurrentInstance, inject, onMounted, onScopeDispose, readonly, ref, watch, type InjectionKey, type Ref } from 'vue'

export const PRESENTATION_VISIBLE: InjectionKey<Readonly<Ref<boolean>>> = Symbol('presentation-visible')
type PresentationBridge = {
  getPresentationVisibility?: () => Promise<boolean>
  onPresentationVisibility?: (callback: (visible: unknown) => void) => (() => void)
}
const windowVisible = ref(true)
let users = 0
let unsubscribe: (() => void) | undefined
let generation = 0

/** One native subscription per renderer; background services explicitly opt out. */
export function useWindowPresentationVisibility() {
  if (getCurrentInstance()) {
    let acquired = false
    onMounted(() => {
      acquired = true
      if (++users !== 1) return
      const api = (window as unknown as { electronAPI?: PresentationBridge }).electronAPI
      const epoch = ++generation
      let received = false
      const apply = (value: unknown) => { if (typeof value === 'boolean') windowVisible.value = value }
      if (api?.onPresentationVisibility) {
        unsubscribe = api.onPresentationVisibility((value: unknown) => { received = true; apply(value) })
        Promise.resolve(api.getPresentationVisibility?.()).then(value => {
          if (epoch === generation && !received) apply(value)
        }).catch(() => { /* Keep the last native state on bridge failure. */ })
      } else {
        // Ordinary browser tabs have no native window bridge.
        const update = () => { windowVisible.value = document.visibilityState !== 'hidden' }
        document.addEventListener('visibilitychange', update)
        unsubscribe = () => document.removeEventListener('visibilitychange', update)
        update()
      }
    })
    onScopeDispose(() => {
      if (acquired && --users === 0) {
        generation++
        unsubscribe?.()
        unsubscribe = undefined
        windowVisible.value = true
      }
    })
  }
  return readonly(windowVisible)
}

export function usePresentationVisibility() {
  if (!getCurrentInstance()) return computed(() => true)
  return inject(PRESENTATION_VISIBLE, null) ?? useWindowPresentationVisibility()
}

/** A requested activity follows visibility without changing the user's intent. */
export function usePresentationActivity(start: () => unknown, stop: () => void, background = false) {
  const visible = background ? computed(() => true) : usePresentationVisibility()
  let requested = false
  let running = false
  const suspend = () => { if (running) { running = false; stop() } }
  const resume = () => {
    if (requested && visible.value && !running) { running = true; return start() }
  }
  const unwatch = watch(visible, value => { if (value) resume(); else suspend() }, { flush: 'sync' })
  function halt() { requested = false; suspend() }
  if (getCurrentInstance()) onScopeDispose(() => { halt(); unwatch() })
  return {
    start() { requested = true; return resume() },
    stop: halt,
    visible,
  }
}

/** Timers perform one current-state refresh on resume, never replay missed ticks. */
export function usePresentationInterval(callback: () => void, ms: number) {
  let timer: ReturnType<typeof setInterval> | undefined
  return usePresentationActivity(() => {
    callback()
    timer = setInterval(callback, ms)
  }, () => { clearInterval(timer); timer = undefined })
}
