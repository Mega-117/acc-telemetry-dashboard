// ============================================
// v-rc-switch: la selezione di un selettore .rc-switch (Sessione / Telemetria, Focus / Completa,
// Giro / Box) scorre da una voce all'altra, come la linea della navbar.
// Un solo riquadro (fondo chiaro + linea rossa) segue la voce scelta: .active, aria-selected o aria-pressed.
// ============================================

interface RcSwitchElement extends HTMLElement {
  _rcSwitch?: { observer: MutationObserver, resize?: ResizeObserver, frame?: number }
}

const ACTIVE = ':scope > button.active, :scope > button[aria-selected="true"], :scope > button[aria-pressed="true"]'

function place(el: HTMLElement, indicator: HTMLElement) {
  const active = el.querySelector<HTMLElement>(ACTIVE)
  if (!active) { indicator.style.opacity = '0'; return }
  indicator.style.opacity = '1'
  indicator.style.width = `${active.offsetWidth}px`
  indicator.style.transform = `translateX(${active.offsetLeft}px)`
}

export const vRcSwitch = {
  mounted(el: RcSwitchElement) {
    const indicator = document.createElement('span')
    indicator.className = 'rc-switch__indicator'
    indicator.setAttribute('aria-hidden', 'true')
    el.prepend(indicator)
    el.classList.add('rc-switch--sliding')
    const update = () => place(el, indicator)
    update()
    // La prima posizione arriva senza animazione; da li' in poi la selezione scorre.
    const frame = requestAnimationFrame(() => el.classList.add('rc-switch--ready'))
    const observer = new MutationObserver(update)
    observer.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed'] })
    // Il font sportivo arriva dopo il primo disegno e cambia la larghezza delle voci.
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    resize?.observe(el)
    el._rcSwitch = { observer, resize, frame }
  },
  unmounted(el: RcSwitchElement) {
    if (!el._rcSwitch) return
    el._rcSwitch.observer.disconnect()
    el._rcSwitch.resize?.disconnect()
    if (el._rcSwitch.frame) cancelAnimationFrame(el._rcSwitch.frame)
    delete el._rcSwitch
  },
}
