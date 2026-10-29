import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { replaceEntryRoute } from '../../app/services/auth/dashboardEntryRecovery'

// PIP-674: real vue-router, the same guards shape as the app pages (redirect / abort).
const page = { render: () => null }
const isDashboardPath = (path: string) => ['/panoramica', '/hud'].some(prefix => path === prefix || path.startsWith(`${prefix}/`))
async function routerAt(start: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: page },
    { path: '/panoramica', component: page },
    { path: '/hud', component: page },
    { path: '/area-pilota', component: page, beforeEnter: () => '/panoramica' },
    { path: '/test-hud', component: page, beforeEnter: () => '/hud' },
    { path: '/bloccata', component: page, beforeEnter: () => false },
    { path: '/uscita', component: page, beforeEnter: () => '/' },
  ] })
  await router.push(start)
  return router
}
// The check app.vue used before PIP-674.
async function previousEntry(router: Router, destination: string) {
  const failure = await router.replace(destination)
  if (failure && router.currentRoute.value.fullPath !== destination) throw new Error('navigation-failed')
}

describe('dashboard entry navigation (PIP-674)', () => {
  it('a redirect to the page already shown is an entry, not a failure', async () => {
    await expect(previousEntry(await routerAt('/panoramica'), '/area-pilota')).rejects.toThrow('navigation-failed')
    const router = await routerAt('/panoramica')
    await expect(replaceEntryRoute(router, '/area-pilota', isDashboardPath)).resolves.toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/panoramica')
  })
  it('follows a redirect to another dashboard page, also when already there', async () => {
    for (const start of ['/', '/hud']) {
      const router = await routerAt(start)
      await expect(replaceEntryRoute(router, '/test-hud', isDashboardPath)).resolves.toBeUndefined()
      expect(router.currentRoute.value.path).toBe('/hud')
    }
  })
  it('opens the destination and accepts being already there', async () => {
    const router = await routerAt('/')
    await replaceEntryRoute(router, '/panoramica', isDashboardPath)
    await replaceEntryRoute(router, '/panoramica', isDashboardPath)
    expect(router.currentRoute.value.path).toBe('/panoramica')
  })
  it('still fails on aborted navigations and on duplicates outside the dashboard', async () => {
    await expect(replaceEntryRoute(await routerAt('/'), '/bloccata', isDashboardPath)).rejects.toThrow('navigation-failed')
    await expect(replaceEntryRoute(await routerAt('/panoramica'), '/bloccata', isDashboardPath)).rejects.toThrow('navigation-failed')
    await expect(replaceEntryRoute(await routerAt('/'), '/uscita', isDashboardPath)).rejects.toThrow('navigation-failed')
  })
})
