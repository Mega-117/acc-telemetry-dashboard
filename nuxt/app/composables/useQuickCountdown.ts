import { computed, onScopeDispose, ref } from 'vue'

/** A local deadline keeps counting even when the overlay presentation is hidden. */
export function useQuickCountdown(onFinalSeconds: () => void, onFinished: () => void) {
  const status = ref<'idle' | 'running' | 'finished'>('idle')
  const remainingMs = ref(0)
  let deadline = 0
  let revealed = false
  let interval: ReturnType<typeof setInterval> | undefined
  function clear() { if (interval !== undefined) clearInterval(interval); interval = undefined }
  function tick() {
    remainingMs.value = Math.max(0, deadline - Date.now())
    if (remainingMs.value === 0) {
      clear()
      status.value = 'finished'
    }
    if (!revealed && remainingMs.value <= 5000) { revealed = true; onFinalSeconds() }
    if (status.value === 'finished') onFinished()
  }
  function start(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 5999) return false
    clear()
    deadline = Date.now() + Math.round(seconds) * 1000
    revealed = false
    status.value = 'running'
    interval = setInterval(tick, 100)
    tick()
    return true
  }
  function cancel() { clear(); status.value = 'idle'; remainingMs.value = 0 }
  onScopeDispose(clear)
  const secondsLeft = computed(() => Math.ceil(remainingMs.value / 1000))
  const display = computed(() => `${Math.floor(secondsLeft.value / 60).toString().padStart(2, '0')}:${(secondsLeft.value % 60).toString().padStart(2, '0')}`)
  return { status, remainingMs, display, start, cancel }
}
