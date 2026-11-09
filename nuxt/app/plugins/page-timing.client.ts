import { createNavigationClock, createStartupMark, pageShown, pageTimingNote } from '~/services/monitoring/pageTiming'
import { noteFeatureUse } from '~/services/usage/featureUseNote'

// PIP-742: a page that takes a second or more to appear after the click reaches the diary (R2 KO).
export default defineNuxtPlugin(() => {
  const router = useRouter()
  const clock = createNavigationClock(() => performance.now())
  const isStartup = createStartupMark()
  const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  router.beforeEach((to, from) => {
    // The first page of a window is its start-up, not a click.
    if (from.matched.length > 0 && to.path !== from.path) clock.start(to)
  })
  router.afterEach(async (to, _from, failure) => {
    // Each navigation ends only its own clock: a cancelled one never clears the next (Codex 06/11).
    const started = clock.take(to)
    if (started === null || failure) return
    await nextPaint()
    const shown = pageShown(to.path, started, performance.now())
    if (!shown) return
    // PIP-755: only a page of the main window can be its start-up page.
    noteFeatureUse(pageTimingNote(shown, isStartup()))
  })
})
