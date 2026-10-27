import { browserLocalPersistence, browserSessionPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth'
import { app } from '~/config/firebase'

// Secondary Electron renderers share persistence with the primary dashboard
// and are authorized by the main process. Import this module only after the
// renderer-role gate so they never initialize Firebase Auth independently.
// PIP-640: same persistence as getAuth(), but without the popup/redirect resolver: the site signs in with
// email and password only, and that resolver loads apis.google.com on start (extra script, a CSP error in the
// console, slower first load).
function createAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] })
  } catch {
    // Already initialised (module reloaded in development): reuse the same instance.
    return getAuth(app)
  }
}
export const auth = createAuth()
