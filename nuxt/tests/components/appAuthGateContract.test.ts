// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(
  fileURLToPath(new URL('../../app/app.vue', import.meta.url)),
  'utf8',
)

describe('App protected runtime route contract', () => {
  it("non monta il banner cloud prima che la sessione possa entrare nell'app", () => {
    const bannerMounts = appSource.match(/<ElectronRuntimeCapabilityBanner\b[^>]*\/>/g) ?? []

    expect(bannerMounts).toHaveLength(2)
    expect(bannerMounts.every((mount) => mount.includes('v-if="canEnterApp"'))).toBe(true)
  })

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

    expect(authSource).toContain('const authRevisionLease = createAuthRevisionLeaseCoordinator()')
    expect(authSource).toContain('if (!shouldObserveFirebaseAuth())')
    expect(authSource).toContain('await requestLocalRuntimeAttestation()')
    expect(authSource).toContain('previousObservedUid !== observedAuthUid')
    expect(authSource).toContain('await clearLocalUserIdentity()')
    expect(authSource).toContain('() => authRevisionLease.isRevisionCurrent(revision)')
    expect(authSource).toContain("const authSessionStatus = ref<AuthSessionStatus>('initializing')")
    expect(authSource).toContain("result.status === 'recoverable'")
    expect(authSource).toContain('authRecoveryCoordinator.schedule()')

    const revisionGuard = authSource.indexOf('if (!isCurrentRevision()) return {')
    const bridgeSave = authSource.indexOf('const saved = await saveLocalUserIdentity(user)')
    expect(revisionGuard).toBeGreaterThan(0)
    expect(revisionGuard).toBeLessThan(bridgeSave)
  })

  it('usa un solo stato auth per shell e startup Electron', () => {
    const overlaySource = readFileSync(
      fileURLToPath(new URL('../../app/components/auth/AuthOverlay.vue', import.meta.url)),
      'utf8',
    )

    expect(appSource).toContain('watch([authLoading, authSessionStatus]')
    expect(appSource).toContain('applyAuthSessionToShell(status, initial)')
    expect(appSource).toContain('publishAuthStartupOutcome(outcome)')
    expect(appSource).not.toContain('handleLoginSuccess = (email: string, emailVerified: boolean)')
    expect(overlaySource).not.toContain('!!result.user?.emailVerified')
  })

  it('riconcilia lo stato autorevole prima di ogni reinvio verifica', () => {
    const authSource = readFileSync(
      fileURLToPath(new URL('../../app/composables/useFirebaseAuth.ts', import.meta.url)),
      'utf8',
    )
    const resendStart = authSource.indexOf('const resendVerificationEmail = async () =>')
    const resetStart = authSource.indexOf('const resetPassword = async', resendStart)
    const resendBlock = authSource.slice(resendStart, resetStart)

    expect(resendBlock).toContain('const verification = await checkEmailVerified()')
    expect(resendBlock.indexOf('await checkEmailVerified()')).toBeLessThan(
      resendBlock.indexOf('await resendCurrentVerificationEmail(user)'),
    )
    expect(resendBlock).toContain('if (!isCurrentAuthLease(lease))')
    expect(resendBlock).toContain('alreadyVerified: true')
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

  it('avvia e spegne gli ascolti globali (feed, Pit Wall) insieme alla dashboard di un utente che puo entrare', () => {
    // PIP-360: la vista nuova del Pit Wall e' reale, non una sandbox: non
    // esiste piu' uno stato che spegne i job cloud. Lo store del Pit Wall vive
    // qui, parte con la dashboard e si ferma al logout, come il feed attivita'.
    const ownerSource = readFileSync(
      fileURLToPath(new URL('../../app/composables/usePrimaryCloudOwner.ts', import.meta.url)),
      'utf8',
    )

    expect(appSource).not.toContain('usePitwallConceptMode')
    expect(appSource).not.toContain('isPitwallConceptSandbox')
    expect(appSource).toContain("import { usePitwallLiveStore } from '~/composables/usePitwallLiveStore'")
    expect(appSource).toContain('providePitwallStore(pitwallStore)')
    expect(appSource).toContain('cloudEnabled: cloudJobsAllowed')
    expect(appSource).toContain('&& cloudJobsAllowed.value')
    expect(appSource).toContain('[appState, currentUser, canEnterApp]')
    expect(appSource).toContain("if (state !== 'dashboard' || !user || !canEnter)")
    expect(appSource).toContain('pitwallStore.halt()')
    expect(appSource).toContain('pitwallStore.start()')
    expect(appSource).not.toContain("appState.value = 'dashboard'\n    listenToActivitiesTracked")
    expect(ownerSource).toContain('const cloudEnabled = computed(() => options.cloudEnabled?.value ?? true)')
    expect(ownerSource).toContain('if (!cloudEnabled.value) return false')
    expect(ownerSource).toContain('[currentUid, options.canEnterApp, isExactPrimaryOwner, cloudEnabled]')
  })
})
