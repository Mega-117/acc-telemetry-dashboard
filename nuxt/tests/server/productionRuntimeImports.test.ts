import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tabsBar = readFileSync(resolve(process.cwd(), 'app/components/layout/TabsBarRouter.vue'), 'utf8')
const appShell = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8')
const githubPagesFallback = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8')
const rootPage = readFileSync(resolve(process.cwd(), 'app/pages/index.vue'), 'utf8')
const nuxtConfig = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')

describe('production runtime imports', () => {
  it('imports the feature access composable used by the global navigation', () => {
    expect(tabsBar).toContain("import { useFeatureAccess } from '~/composables/useFeatureAccess'")
    expect(tabsBar).toContain('const { canAccess } = useFeatureAccess()')
  })

  it('preserves dynamic routes across the GitHub Pages fallback', () => {
    expect(githubPagesFallback).toContain("'?spa-redirect-path=' + encodeURIComponent(redirectPath)")
    expect(appShell).toContain('if (queryRedirectPath) {')
    expect(appShell).toContain('router.replace(queryRedirectPath)')
    expect(appShell).toContain('if (pendingSpaRedirectPath.value) {')
    expect(rootPage).toContain("if (typeof route.query['spa-redirect-path'] === 'string') return")
    expect(nuxtConfig).toContain("window.history.replaceState(null, '', appBase + redirectPath)")
  })
})
