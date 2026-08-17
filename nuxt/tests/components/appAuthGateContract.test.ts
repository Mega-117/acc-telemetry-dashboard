// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(
  fileURLToPath(new URL('../../app/app.vue', import.meta.url)),
  'utf8',
)

describe('App protected runtime route contract', () => {
  it('gates every standalone runtime before mounting NuxtPage', () => {
    expect(appSource).toContain('const isProtectedRuntimeRoute = computed')
    expect(appSource).toContain('const canMountProtectedRuntime = computed')

    const secondaryGate = appSource.indexOf(
      '<template v-if="isProtectedRuntimeRoute && isSecondaryLocalRuntime && !canMountProtectedRuntime">',
    )
    const authGate = appSource.indexOf(
      '<template v-else-if="isProtectedRuntimeRoute && !canMountProtectedRuntime">',
    )
    const standaloneRuntime = appSource.indexOf(
      '<template v-else-if="isStandaloneRuntimeRoute">',
    )
    const trainingRuntime = appSource.indexOf(
      '<template v-else-if="isTrainingOverlayIntent">',
    )
    const hudRuntime = appSource.indexOf(
      '<template v-else-if="isHudOverlayRoute">',
    )

    expect(secondaryGate).toBeGreaterThan(0)
    expect(authGate).toBeGreaterThan(secondaryGate)
    expect(authGate).toBeLessThan(standaloneRuntime)
    expect(authGate).toBeLessThan(trainingRuntime)
    expect(authGate).toBeLessThan(hudRuntime)
    expect(appSource.slice(secondaryGate, authGate)).not.toContain('<AuthOverlay')
    expect(appSource.slice(authGate, standaloneRuntime)).toContain('<AuthOverlay')
  })

  it('guards local runtime activation against stale auth callbacks', () => {
    const authSource = readFileSync(
      fileURLToPath(new URL('../../app/composables/useFirebaseAuth.ts', import.meta.url)),
      'utf8',
    )

    expect(authSource).toContain('let observedAuthUid: string | null = null')
    expect(authSource).toContain('if (!shouldObserveFirebaseAuth())')
    expect(authSource).toContain('await requestLocalRuntimeAttestation()')
    expect(authSource).toContain('previousObservedUid !== observedAuthUid')
    expect(authSource).toContain('await clearLocalUserIdentity()')
    expect(authSource).toContain('() => revision === authStateRevision')

    const revisionGuard = authSource.indexOf('if (!isCurrentRevision()) return null')
    const bridgeSave = authSource.indexOf('const saved = await saveLocalUserIdentity(user)')
    expect(revisionGuard).toBeGreaterThan(0)
    expect(revisionGuard).toBeLessThan(bridgeSave)
  })

  it('monta i job cloud solo nel primary e lascia RuntimeWindow consumer pura', () => {
    const ownerSource = readFileSync(
      fileURLToPath(new URL('../../app/composables/usePrimaryCloudOwner.ts', import.meta.url)),
      'utf8',
    )
    const runtimePage = readFileSync(
      fileURLToPath(new URL('../../app/pages/runtime-bootstrap.vue', import.meta.url)),
      'utf8',
    )

    expect(appSource).toContain('usePrimaryCloudOwner')
    expect(appSource).toContain('flushEnabled: primaryCloudOwner.jobsEnabled')
    expect(ownerSource).toContain("api?.localIdentityRole === 'primary'")
    expect(ownerSource).toContain('isRuntimeWindowOwner(api)')
    expect(ownerSource).toContain('await waitForOwnerJobsIdle()')
    expect(ownerSource).toContain('sync.waitForOwnerIdle()')
    expect(ownerSource).toContain('heartbeat.waitForIdle()')
    expect(appSource).toContain('primaryCloudOwner.registerOwnerDrainer(clientDiagnostics.waitForIdle)')
    expect(runtimePage).not.toContain('useElectronSync')
    expect(runtimePage).not.toContain('useClientHeartbeat')
    expect(runtimePage).not.toMatch(/firebase/i)
  })
})
