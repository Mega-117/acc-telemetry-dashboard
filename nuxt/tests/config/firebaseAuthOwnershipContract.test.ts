// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('Firebase Auth renderer ownership contract', () => {
  it('keeps getAuth out of the app and Firestore module shared by overlays', () => {
    const firebase = source('../../app/config/firebase.ts')
    const firebaseAuth = source('../../app/config/firebaseAuth.ts')
    const activityFeed = source('../../app/composables/useActivityFeed.ts')

    expect(firebase).not.toContain("from 'firebase/auth'")
    expect(firebase).not.toContain('getAuth(')
    expect(activityFeed).not.toContain('getAuth(')
    expect(firebaseAuth).toContain('export const auth = getAuth(app)')
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
