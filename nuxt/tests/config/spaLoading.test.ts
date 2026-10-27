// PIP-640: one loading screen in HTML, shown at once in browsers and never in the desktop app; the app fades it out.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOOT_LEAVE_MS, BOOT_SCREEN_ID, spaLoadingHtml } from '../../shared/spaLoading'
import { RACING_BACKDROP_BACKGROUND, RACING_SPARK_FROM, RACING_SPARK_TO, RACING_SPARKS, sparkDelay } from '../../shared/racingBackdrop'
import { BOOT_GLIDE_MS, BOOT_MIN_VISIBLE_MS, bootHoldLeft, dismissBootScreen, glideBootLogoTo, handBootBackdropToApp, logoGlideStart } from '../../app/utils/bootScreen'

describe('spaLoadingHtml', () => {
  it('shows the login logo under the site base path, with a high fetch priority', () => {
    const html = spaLoadingHtml('/acc-telemetry-dashboard/docs/')
    expect(html).toContain('src="/acc-telemetry-dashboard/docs/branding/auth/racer_core_exact.svg"')
    expect(html).toContain('fetchpriority="high"')
    expect(spaLoadingHtml('/')).toContain('src="/branding/auth/racer_core_exact.svg"')
  })

  it('has a laser, a glowing logo and an entry by scale only (no opacity: it would delay the first paint)', () => {
    const html = spaLoadingHtml('/')
    expect(html).toContain('class="rc-boot__laser"')
    expect(html).toContain('@keyframes rc-boot-glow')
    expect(html).toContain('@keyframes rc-boot-laser')
    expect(html).toContain('@keyframes rc-boot-in{from{transform:scale(.96)}}')
    expect(html).not.toMatch(/rc-boot-in{from{opacity/)
    expect(html).toContain('prefers-reduced-motion')
  })

  it('stays hidden in the desktop app and leaves the Nuxt loader element in the browser', () => {
    const html = spaLoadingHtml('/')
    expect(html).toContain('display:none')
    expect(html).toContain('if(/Electron/.test(navigator.userAgent)){b.remove();return}')
    expect(html).toContain('document.body.appendChild(b)')
    expect(html).toContain("document.head.appendChild(document.getElementById('rc-boot-style'))")
    // Sized from the whole window (innerWidth), so the scrollbar space reserved later does not shift it.
    expect(html).toContain('width:var(--rc-boot-w,100vw)')
    expect(html).toContain("b.style.setProperty('--rc-boot-w',innerWidth+'px')")
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

describe('logoGlideStart', () => {
  it('puts the loader logo over the login logo: same centre, same size', () => {
    const login = { left: 450, top: 60, width: 527, height: 263 }
    const loader = { left: 508, top: 315, width: 410, height: 205 }
    // Centres: login (713.5, 191.5), loader (713, 417.5); scale 527 / 410.
    expect(logoGlideStart(login, loader)).toBe('translate(0.5px, -226.0px) scale(1.2854)')
  })

  it('does nothing while the loader logo has no size yet', () => {
    expect(logoGlideStart({ left: 0, top: 0, width: 100, height: 50 }, { left: 0, top: 0, width: 0, height: 0 })).toBe('')
  })
})

describe('bootHoldLeft', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('keeps the start loader up to its minimum time since the page opened, only while it exists', () => {
    expect(bootHoldLeft(document, 300)).toBe(0)
    document.body.innerHTML = `<div id="${BOOT_SCREEN_ID}"></div>`
    expect(bootHoldLeft(document, 300)).toBe(BOOT_MIN_VISIBLE_MS - 300)
    expect(bootHoldLeft(document, BOOT_MIN_VISIBLE_MS + 500)).toBe(0)
  })
})

describe('glideBootLogoTo', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('moves the loader logo onto the login logo, then removes the loading screen', () => {
    vi.useFakeTimers()
    document.body.innerHTML = `<div id="${BOOT_SCREEN_ID}"><div class="rc-boot__inner"><img></div></div><img id="target">`
    const logo = document.querySelector<HTMLElement>(`#${BOOT_SCREEN_ID} img`)!
    logo.getBoundingClientRect = () => ({ left: 500, top: 300, width: 400, height: 200 }) as DOMRect
    const target = document.getElementById('target')!
    target.getBoundingClientRect = () => ({ left: 450, top: 50, width: 500, height: 250 }) as DOMRect
    glideBootLogoTo(target)
    expect(document.getElementById(BOOT_SCREEN_ID)!.classList.contains('is-gliding')).toBe(true)
    expect(logo.style.transform).toBe('translate(0.0px, -225.0px) scale(1.2500)')
    vi.advanceTimersByTime(BOOT_GLIDE_MS + 300)
    expect(document.getElementById(BOOT_SCREEN_ID)).toBeNull()
  })

  it('falls back to the fade when there is no login logo to reach', () => {
    document.body.innerHTML = `<div id="${BOOT_SCREEN_ID}"><div class="rc-boot__inner"><img></div></div>`
    glideBootLogoTo(null)
    expect(document.getElementById(BOOT_SCREEN_ID)!.classList.contains('is-leaving')).toBe(true)
  })
})
