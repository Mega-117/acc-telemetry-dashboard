import { pageShown } from '~/services/monitoring/pageTiming'
import { noteFeatureUse } from '~/services/usage/featureUseNote'

// PIP-742: a page that takes a second or more to appear after the click reaches the diary (R2 KO).
export default defineNuxtPlugin(() => {
  const router = useRouter()
  let startedAt: number | null = null
  const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  router.beforeEach((to, from) => {
    // The first page of a window is its start-up, not a click.
    startedAt = from.matched.length > 0 && to.path !== from.path ? performance.now() : null
  })
  router.afterEach(async (to, _from, failure) => {
    const started = startedAt
    startedAt = null
    if (started === null || failure) return
    await nextPaint()
    const shown = pageShown(to.path, started, performance.now())
    if (!shown) return
    noteFeatureUse({ event: shown.slow ? 'page.slow' : 'page.shown', page: shown.page, ms: shown.ms })
  })
})
