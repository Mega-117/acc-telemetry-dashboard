// PIP-571 / PIP-757: shared state of the introduction. In one sentence: it opens by itself only the
// first time an account enters Racer Core (on any PC), and never again by itself (user decisions 22/10
// and 08/11): it is marked as seen as soon as it appears, so "Lo faccio dopo", "Salta" or quitting
// halfway do not bring it back. Impostazioni reopens it from the start at any time.
// The rule (profile + this PC's copy, the higher wins) lives in services/onboarding/onboardingSeen.ts.
import { doc, serverTimestamp } from 'firebase/firestore'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedUpdateDoc } from '~/composables/useFirebaseTracker'
import { db } from '~/config/firebase'
import { loadOwnerDocument, rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import {
  evaluateOnboarding,
  markOnboardingSeen,
  profileSeenVersion,
  REASON_CODE,
  type OnboardingDeps,
} from '~/services/onboarding/onboardingSeen'
import { noteFeatureUse } from '~/services/usage/featureUseNote'

export type OnboardingPhase = 'tour' | 'commands'
export type OnboardingResult = 'done' | 'later'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** The account profile behind the rule: `users/{uid}.onboarding`, through the shared owner document. */
function onboardingDeps(uid: string, isCurrent: () => boolean): OnboardingDeps {
  return {
    storage: storage(),
    async readRemote() {
      const owner = await loadOwnerDocument(uid, { caller: 'OnboardingSeen' })
      return owner.exists ? profileSeenVersion(owner.data) : 0
    },
    async writeRemote(seenVersion) {
      // The whole map: firestore.rules validOnboarding checks exactly these two fields.
      await trackedUpdateDoc(doc(db, 'users', uid), { onboarding: { seenVersion, seenAt: serverTimestamp() } }, 'OnboardingSeen')
      rememberOwnerDocumentPatch(uid, { onboarding: { seenVersion, seenAt: new Date().toISOString() } })
    },
    note: noteFeatureUse,
    isCurrent,
  }
}

export function useOnboardingIntro() {
  const visible = useState<boolean>('onboarding-intro-visible', () => false)
  const startPhase = useState<OnboardingPhase>('onboarding-intro-start', () => 'tour')
  // Account already evaluated (or being evaluated) in this session: never re-open by itself,
  // even when nothing could be written.
  const evaluatedOwner = useState<string>('onboarding-intro-evaluated', () => '')
  // PIP-749: bumped by every open, so a reopen while the window is already up restarts it.
  const openings = useState<number>('onboarding-intro-openings', () => 0)
  const { currentUser } = useFirebaseAuth()

  /** Opens the intro by itself only when this account has not seen the current version anywhere. */
  const showIfFirstTime = async (): Promise<boolean> => {
    const uid = currentUser.value?.uid
    if (!uid || visible.value || evaluatedOwner.value === uid) return false
    evaluatedOwner.value = uid
    const isCurrent = () => currentUser.value?.uid === uid
    // Waits for the profile (short timeout): never shown early, never shown twice.
    const reason = await evaluateOnboarding(uid, onboardingDeps(uid, isCurrent))
    // Opened from Impostazioni meanwhile: already on screen, and already recorded by open().
    if (!reason || !isCurrent() || visible.value) return false
    startPhase.value = 'tour'
    visible.value = true
    return true
  }

  /** Re-opens on demand (Impostazioni) from the first card, regardless of the status. */
  const open = async () => {
    const uid = currentUser.value?.uid
    startPhase.value = 'tour'
    visible.value = true
    openings.value++
    noteFeatureUse({ event: 'onboarding.opened', reason: REASON_CODE.manual, remote: 0 })
    // Seen on every PC of the account from now on (a manual open is never a repeat).
    if (uid) void markOnboardingSeen(uid, onboardingDeps(uid, () => currentUser.value?.uid === uid), { blind: false }).catch(() => {})
  }

  /** Closes. Nothing to record: it was recorded as seen when it appeared, however it ends. */
  const close = () => { visible.value = false }

  /** PIP-749: the account changed while the window was open: it was not theirs, drop it. */
  const abandon = () => { visible.value = false }

  return { visible, startPhase, openings, showIfFirstTime, open, close, abandon }
}
