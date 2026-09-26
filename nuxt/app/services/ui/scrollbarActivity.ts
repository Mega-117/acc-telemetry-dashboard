/** One delegated listener covers document scroll and dynamically mounted panels. */
export function installScrollbarActivity(doc: Document = document) {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>()
  doc.documentElement.classList.add('auto-hide-scrollbars')
  function onScroll(event: Event) {
    const element = event.target === doc ? doc.scrollingElement || doc.documentElement : event.target
    if (!(element instanceof Element)) return
    clearTimeout(timers.get(element))
    element.classList.add('is-scrolling')
    timers.set(element, setTimeout(() => {
      element.classList.remove('is-scrolling')
      timers.delete(element)
    }, 650))
  }
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => {
    doc.removeEventListener('scroll', onScroll, true)
    for (const [element, timer] of timers) {
      clearTimeout(timer)
      element.classList.remove('is-scrolling')
    }
    timers.clear()
    doc.documentElement.classList.remove('auto-hide-scrollbars')
  }
}
