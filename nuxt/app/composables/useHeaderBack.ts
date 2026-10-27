import { inject, onBeforeUnmount, onMounted, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'

interface HeaderBackAction {
  label: () => string
  run: () => unknown
}

const headerBackKey: InjectionKey<ShallowRef<HeaderBackAction | null>> = Symbol('header-back')
const historyBackKey: InjectionKey<() => unknown> = Symbol('header-history-back')

export function provideHeaderBack(historyBack?: () => unknown) {
  const action = shallowRef<HeaderBackAction | null>(null)
  provide(headerBackKey, action)
  if (historyBack) provide(historyBackKey, historyBack)
  return action
}

/**
 * PIP-657: true when the previous history entry is a page of this app. Vue Router keeps it in
 * `history.state.back`; it is null on a page opened directly (app start, shared link, reload), where
 * going back would leave the app for a blank page.
 */
export function hasInAppHistory(): boolean {
  if (typeof window === 'undefined') return false
  const state = window.history.state as { back?: unknown } | null
  return typeof state?.back === 'string' && state.back.length > 0
}

export function useHeaderBack(run: () => unknown, label: () => string, mode: 'history' | 'view' = 'history') {
  const header = inject(headerBackKey, null)
  const historyBack = inject(historyBackKey, null)
  // Routed pages return through history; same-route views keep their local exit. Without an in-app
  // previous page, history mode falls back to the page's own parent (Sessioni, Piste, Panoramica).
  const action: HeaderBackAction = mode === 'history' && historyBack
    ? { run: () => (hasInAppHistory() ? historyBack() : run()), label: () => 'Indietro' }
    : { run, label }
  onMounted(() => { if (header) header.value = action })
  // A leaving page must not clear the action of the page entering after it.
  onBeforeUnmount(() => { if (header?.value === action) header.value = null })
  return Boolean(header)
}
