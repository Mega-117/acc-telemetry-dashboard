// PIP-571: shared state of the introduction. In one sentence: it opens by itself only the very
// first time a user starts Racer Core on this installation, and never again by itself (user
// request 22/10, the usual "show once" pattern): it is marked as seen as soon as it appears, so
// "Lo faccio dopo", "Salta" or quitting halfway do not bring it back. Impostazioni reopens it
// from the start at any time.
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  BROWSER_INSTALLATION_ID,
  readOnboardingStatus,
  writeOnboardingStatus,
} from '~/services/onboarding/onboardingSeen'

export type OnboardingPhase = 'tour' | 'commands'
export type OnboardingResult = 'done' | 'later'

interface OnboardingRuntimeApi {
  getRuntimeIdentity?: () => Promise<{ installationId?: string | null; fallback?: boolean } | null>
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

async function resolveInstallationId(): Promise<string> {
  if (typeof window === 'undefined') return BROWSER_INSTALLATION_ID
  const api = (window as Window & { electronAPI?: OnboardingRuntimeApi }).electronAPI
  if (!api?.getRuntimeIdentity) return BROWSER_INSTALLATION_ID
  try {
    const identity = await api.getRuntimeIdentity()
    return identity?.installationId || BROWSER_INSTALLATION_ID
  } catch {
    return BROWSER_INSTALLATION_ID
  }
}

export function useOnboardingIntro() {
  const visible = useState<boolean>('onboarding-intro-visible', () => false)
  const startPhase = useState<OnboardingPhase>('onboarding-intro-start', () => 'tour')
  // Owner (uid:installation) already evaluated in this session: never re-open by itself,
  // even when the status could not be written.
  const evaluatedOwner = useState<string>('onboarding-intro-evaluated', () => '')
  const owner = useState<{ uid: string; installationId: string } | null>('onboarding-intro-owner', () => null)
  const { currentUser } = useFirebaseAuth()

  /** Opens the intro by itself only when this user on this installation has never seen it. */
  const showIfFirstTime = async (): Promise<boolean> => {
    const uid = currentUser.value?.uid
    if (!uid || visible.value) return false
    const installationId = await resolveInstallationId()
    const key = `${uid}:${installationId}`
    if (evaluatedOwner.value === key) return false
    evaluatedOwner.value = key
    owner.value = { uid, installationId }
    if (readOnboardingStatus(storage(), uid, installationId) !== 'unseen') return false
    // Seen from the moment it appears: the first launch is the only automatic one.
    writeOnboardingStatus(storage(), uid, installationId, 'done')
    startPhase.value = 'tour'
    visible.value = true
    return true
  }

  /** Re-opens on demand (Impostazioni) from the first card, regardless of the status. */
  const open = async () => {
    const uid = currentUser.value?.uid
    if (uid) owner.value = { uid, installationId: await resolveInstallationId() }
    startPhase.value = 'tour'
    visible.value = true
  }

  /** Remembers how it ended for this user on this installation (the window may stay open). */
  const save = (result: OnboardingResult) => {
    if (owner.value) {
      writeOnboardingStatus(storage(), owner.value.uid, owner.value.installationId, result === 'done' ? 'done' : 'commands-pending')
    }
  }

  /** Closes and remembers how it ended. */
  const close = (result: OnboardingResult) => {
    visible.value = false
    save(result)
  }

  return { visible, startPhase, showIfFirstTime, open, save, close }
}
