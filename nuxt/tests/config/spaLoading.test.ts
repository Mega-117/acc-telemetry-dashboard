// PIP-640: one loading screen in HTML, shown at once in browsers and never in the desktop app; the app fades it out.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOOT_LEAVE_MS, BOOT_SCREEN_ID, spaLoadingHtml } from '../../shared/spaLoading'
import { RACING_BACKDROP_BACKGROUND, RACING_SPARK_FROM, RACING_SPARK_TO, RACING_SPARKS, sparkDelay } from '../../shared/racingBackdrop'
import { dismissBootScreen, handBootBackdropToApp } from '../../app/utils/bootScreen'

describe('spaLoadingHtml', () => {
  it('shows the login logo under the site base path, with a high fetch priority', () => {
    const html = spaLoadingHtml('/acc-telemetry-dashboard/docs/')
    expect(html).toContain('src="/acc-telemetry-dashboard/docs/branding/auth/racer_core_exact.svg"')
    expect(html).toContain('fetchpriority="high"')
    expect(spaLoadingHtml('/')).toContain('src="/branding/auth/racer_core_exact.svg"')
  })

  it('has a laser, a glowing logo and an entry fade that starts above zero opacity (still a first paint)', () => {
    const html = spaLoadingHtml('/')
    expect(html).toContain('class="rc-boot__laser"')
    expect(html).toContain('@keyframes rc-boot-glow')
    expect(html).toContain('@keyframes rc-boot-laser')
    expect(html).toContain('@keyframes rc-boot-in{from{opacity:.01')
    expect(html).toContain('prefers-reduced-motion')
  })

  it('stays hidden in the desktop app and leaves the Nuxt loader element in the browser', () => {
    const html = spaLoadingHtml('/')
    expect(html).toContain('display:none')
    expect(html).toContain('if(/Electron/.test(navigator.userAgent)){b.remove();return}')
    expect(html).toContain('document.body.appendChild(b)')
    expect(html).toContain("document.head.appendChild(document.getElementById('rc-boot-style'))")
    // The whole window, so the scrollbar space reserved later does not shift it.
    expect(html).toContain('width:100vw')
  })

  it('is the Nuxt loading template', () => {
    const config = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')
    expect(config).toContain('spaLoadingTemplate: spaLoadingTemplatePath')
    expect(config).toContain('spaLoadingHtml(baseURL)')
  })
})

describe('dismissBootScreen', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('fades the loading screen out, then removes it; a second call does nothing', () => {
    vi.useFakeTimers()
    document.body.innerHTML = `<div id="${BOOT_SCREEN_ID}"></div>`
    dismissBootScreen()
    const boot = document.getElementById(BOOT_SCREEN_ID)
    expect(boot?.classList.contains('is-leaving')).toBe(true)
    dismissBootScreen()
    vi.advanceTimersByTime(BOOT_LEAVE_MS)
    expect(document.getElementById(BOOT_SCREEN_ID)).not.toBeNull()
    vi.advanceTimersByTime(100)
    expect(document.getElementById(BOOT_SCREEN_ID)).toBeNull()
  })

  it('is harmless without a loading screen (desktop app)', () => {
    expect(() => dismissBootScreen()).not.toThrow()
  })
})

describe('loading screen background', () => {
  it('draws the app background with every spark, put on the page clock by the start script', () => {
    const html = spaLoadingHtml('/')
    expect(html).toContain(RACING_BACKDROP_BACKGROUND)
    expect(html.match(/<i data-d=/g)).toHaveLength(RACING_SPARKS.length)
    expect(html).toContain("i.style.animationDelay=(i.getAttribute('data-d')-t)+'s'")
    expect(html).toContain('.has-app .rc-boot__bg{display:none}')
  })

  it('uses the same spark path as the app backdrop component', () => {
    const backdrop = readFileSync(resolve(process.cwd(), 'app/components/ui/RacingBackdrop.vue'), 'utf8')
    expect(backdrop).toContain(`transform: ${RACING_SPARK_FROM}`)
    expect(backdrop).toContain(`transform: ${RACING_SPARK_TO}`)
    expect(backdrop).toContain('RACING_BACKDROP_BACKGROUND')
  })

  it('puts sparks created at different moments in the same place', () => {
    const spark = RACING_SPARKS[3]!
    // Created 2.5 s apart, both delays point to the same moment of the page clock.
    expect(parseFloat(sparkDelay(spark, 500)) + 0.5).toBeCloseTo(parseFloat(sparkDelay(spark, 3000)) + 3, 3)
  })
})

describe('handBootBackdropToApp', () => {
  it('hides the loading screen copy of the background once the app draws its own; the logo stays', () => {
    document.body.innerHTML = `<div id="${BOOT_SCREEN_ID}"></div>`
    handBootBackdropToApp()
    const boot = document.getElementById(BOOT_SCREEN_ID)!
    expect(boot.classList.contains('has-app')).toBe(true)
    expect(boot.classList.contains('is-leaving')).toBe(false)
    document.body.innerHTML = ''
  })
})
