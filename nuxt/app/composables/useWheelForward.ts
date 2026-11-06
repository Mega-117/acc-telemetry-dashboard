import { ref } from 'vue'

/**
 * 06/11 (user): the wheel over a fixed part (Telemetria: button row, sectors, delta) scrolls the box below it, with the
 * same feel as the wheel over that box - the same distance, glided like the browser does (notches in a row add up to one
 * target instead of restarting from where the glide is). Ctrl + wheel is left alone (the charts' zoom).
 */
export function useWheelForward() {
  const box = ref<HTMLElement | null>(null)
  let target: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  function onWheel(event: WheelEvent) {
    const el = box.value
    if (!el || event.ctrlKey || el.scrollHeight <= el.clientHeight) return
    event.preventDefault()
    const step = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaMode === 2 ? event.deltaY * el.clientHeight : event.deltaY
    target = Math.min(el.scrollHeight - el.clientHeight, Math.max(0, (target ?? el.scrollTop) + step))
    el.scrollTo({ top: target, behavior: 'smooth' })
    clearTimeout(timer)
    timer = setTimeout(() => { target = null }, 250)
  }
  return { box, onWheel }
}
