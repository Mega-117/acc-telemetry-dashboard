// PIP-435: contesto del journal dev delle operazioni Firebase — pagina corrente,
// cambi pagina, avvio renderer e login/logout (mai l'UID). Attivo solo nel renderer
// primario Electron in sviluppo: altrove il journal e' spento e il plugin non fa nulla.
import {
  isFirebaseOpsJournalEnabled,
  recordFirebaseJournalEvent,
  routePatternForJournal,
  setFirebaseJournalRoute,
} from '~/services/monitoring/firebaseOpsJournal'

export default defineNuxtPlugin(() => {
  if (!import.meta.dev || !isFirebaseOpsJournalEnabled()) return
  const router = useRouter()

  setFirebaseJournalRoute(routePatternForJournal(router.currentRoute.value))
  recordFirebaseJournalEvent({ kind: 'session', reason: 'renderer-start' })

  router.afterEach((to, from, failure) => {
    if (failure) return
    const route = routePatternForJournal(to)
    const previous = routePatternForJournal(from)
    setFirebaseJournalRoute(route)
    // La navigazione iniziale non e' un cambio pagina: l'avvio e' gia' nell'evento session.
    if (!from.matched.length && route === previous) return
    recordFirebaseJournalEvent({ kind: 'nav', from: previous })
  })

  void import('~/config/firebaseAuth').then(async ({ auth }) => {
    const { onAuthStateChanged } = await import('firebase/auth')
    let last: boolean | null = null
    onAuthStateChanged(auth, (user) => {
      const signedIn = user !== null
      if (signedIn === last) return
      last = signedIn
      recordFirebaseJournalEvent({ kind: 'auth', signedIn })
    })
  }).catch(() => { /* la diagnostica non deve mai toccare l'app */ })
})
