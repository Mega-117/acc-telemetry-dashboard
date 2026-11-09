import { createPageTimingRecorder, pageShown, pageTimingNote } from '~/services/monitoring/pageTiming'
import { noteFeatureUse } from '~/services/usage/featureUseNote'

// PIP-742: a page that takes a second or more to appear after the click reaches the diary (R2 KO).
export default defineNuxtPlugin(() => {
  const router = useRouter()
  const recorder = createPageTimingRecorder(() => performance.now())
  const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  // PIP-755: until the user clicks or types, a navigation continues the window's start-up.
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => recorder.noteUserInput(), { capture: true, passive: true })
  }
  // The first page of a window is its start-up, not a click: never timed.
  router.beforeEach((to, from) => { recorder.start(to, from) })
  router.afterEach(async (to, _from, failure) => {
    // Each navigation ends only its own clock: a cancelled one never clears the next (Codex 06/11).
    const timed = recorder.take(to)
    if (timed === null || failure) return
    await nextPaint()
    const shown = pageShown(to.path, timed.startedAt, performance.now())
    if (!shown) return
    noteFeatureUse(pageTimingNote(shown, timed.startup))
  })
})
