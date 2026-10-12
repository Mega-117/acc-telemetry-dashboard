import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { isDesktopExcludedRoute, removeDesktopExcludedPages } from '../../shared/desktopBundleRoutes'

it('excludes developer tools but keeps Voice Lab and product pages', () => {
  for (const path of ['/dev', '/dev-firebase', '/dev-rebuild', '/dev-cleanup', '/dev-data-audit', '/dev-upload', '/dev-telemetry-compare']) {
    expect(isDesktopExcludedRoute(path)).toBe(true)
  }
  for (const path of ['/dev-voice-lab', '/panoramica', '/developer', '/hud', '/']) {
    expect(isDesktopExcludedRoute(path)).toBe(false)
  }
})

it('removes excluded pages in place from the Nuxt page list', () => {
  const pages = [{ path: '/' }, { path: '/dev' }, { path: '/dev-voice-lab' }, { path: '/dev-firebase' }, { path: '/hud' }]
  removeDesktopExcludedPages(pages)
  expect(pages.map(page => page.path)).toEqual(['/', '/dev-voice-lab', '/hud'])
})

it('applies the exclusion only to the desktop bundle build', () => {
  const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
  expect(config).toMatch(/desktopBundle \? \{ hooks: \{ 'pages:extend': removeDesktopExcludedPages \} \} : \{\}/)
})
