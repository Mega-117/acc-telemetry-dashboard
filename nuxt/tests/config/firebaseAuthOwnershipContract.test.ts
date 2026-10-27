// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('Firebase Auth renderer ownership contract', () => {
  it('keeps Auth initialisation out of the app and Firestore module shared by overlays', () => {
    const firebase = source('../../app/config/firebase.ts')
    const firebaseAuth = source('../../app/config/firebaseAuth.ts')
    const activityFeed = source('../../app/composables/useActivityFeed.ts')

    expect(firebase).not.toContain("from 'firebase/auth'")
    expect(firebase).not.toContain('getAuth(')
    expect(activityFeed).not.toContain('getAuth(')
    // PIP-640: initializeAuth with the getAuth persistence, without the popup resolver (no apis.google.com).
    expect(firebaseAuth).toContain('initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] })')
    expect(firebaseAuth).toContain('export const auth = createAuth()')
    expect(firebaseAuth).not.toContain('PopupRedirectResolver')
  })

  it('loads Auth only after the primary/browser role gate', () => {
    const composable = source('../../app/composables/useFirebaseAuth.ts')
    const plugin = source('../../app/plugins/firebase-emulators.client.ts')

    expect(composable).not.toMatch(/^import .*firebaseAuth/m)
    expect(composable).toContain('if (!shouldObserveFirebaseAuth())')
    expect(composable.indexOf('if (!shouldObserveFirebaseAuth())')).toBeLessThan(
      composable.indexOf('authRuntime = await getAuthDependencies()'),
    )
    expect(plugin).toContain('if (shouldObserveFirebaseAuth()')
    expect(plugin).toContain("import('~/config/firebaseAuth')")
  })
})
