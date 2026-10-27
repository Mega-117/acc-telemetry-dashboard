// PIP-640: schermata di caricamento in HTML, mostrata subito nei browser e mai nel programma desktop.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { spaLoadingHtml } from '../../shared/spaLoading'

describe('spaLoadingHtml', () => {
  it('shows the login logo under the site base path, with a high fetch priority', () => {
    const html = spaLoadingHtml('/acc-telemetry-dashboard/docs/')
    expect(html).toContain('src="/acc-telemetry-dashboard/docs/branding/auth/racer_core_exact.svg"')
    expect(html).toContain('fetchpriority="high"')
    expect(spaLoadingHtml('/')).toContain('src="/branding/auth/racer_core_exact.svg"')
  })

  it('stays hidden unless the browser is not Electron (no logo flash on in-game overlays)', () => {
    const html = spaLoadingHtml('/')
    expect(html).toContain('display:none')
    expect(html).toContain("if(!/Electron/.test(navigator.userAgent))")
  })

  it('is the Nuxt loading template', () => {
    const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    expect(config).toContain('spaLoadingTemplate: spaLoadingTemplatePath')
    expect(config).toContain('spaLoadingHtml(baseURL)')
  })
})
