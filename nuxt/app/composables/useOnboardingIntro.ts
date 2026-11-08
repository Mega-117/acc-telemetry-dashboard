// PIP-571 / PIP-757: shared state of the introduction. In one sentence: it opens by itself only the
// first time an account enters Racer Core (on any PC), and never again by itself (user decisions 22/10
// and 08/11): it is marked as seen as soon as it appears, so "Lo faccio dopo", "Salta" or quitting
// halfway do not bring it back. Impostazioni reopens it from the start at any time.
// The rule (profile + this PC's copy, the higher wins) lives in services/onboarding/onboardingSeen.ts.
import { doc } from 'firebase/firestore'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedRunTransaction } from '~/composables/useFirebaseTracker'
import { db } from '~/config/firebase'
import { loadOwnerDocument, rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import { saveOnboardingSeen } from '~/services/onboarding/onboardingProfile'
import {
  createOnboardingMemory,
  evaluateOnboarding,
  markOnboardingSeen,
  profileSeen,
  REASON_CODE,
  type OnboardingDeps,
  type OnboardingMemory,
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
function onboardingDeps(uid: string, isCurrent: () => boolean, memory: OnboardingMemory): OnboardingDeps {
  return {
    storage: storage(),
    memory,
    async readRemote() {
      const owner = await loadOwnerDocument(uid, { caller: 'OnboardingSeen' })
      return owner.exists ? profileSeen(owner.data) : { version: 0, how: null }
    },
    async writeRemote(version, how) {
      const profile = doc(db, 'users', uid)
      const result = await saveOnboardingSeen(update => trackedRunTransaction(db, 'OnboardingSeen', profile, update), profile, version, how)
      if (result.written) rememberOwnerDocumentPatch(uid, { onboarding: { seenVersion: version, seenAt: new Date().toISOString(), how } })
      return result
    },
    note: noteFeatureUse,
    isCurrent,
  }
}

export function useOnboardingIntro() {
  const visible = useState<boolean>('onboarding-intro-visible', () => false)
  const startPhase = useState<OnboardingPhase>('onboarding-intro-start', () => 'tour')
  // Per account in this session: 'running' while the profile is awaited, 'done' once decided (it never
  // reopens by itself). A cancelled evaluation (the account changed) is released, so it runs again.
  const evaluation = useState<Record<string, 'running' | 'done'>>('onboarding-intro-evaluation', () => ({}))
  // PIP-749: bumped by every open, so a reopen while the window is already up restarts it.
  const openings = useState<number>('onboarding-intro-openings', () => 0)
  // PIP-757: one per app session: "seen" holds here even when localStorage refuses every write.
  const memory = useState<OnboardingMemory>('onboarding-intro-memory', createOnboardingMemory).value
  const { currentUser } = useFirebaseAuth()

  /** Opens the intro by itself only when this account has not seen the current version anywhere. */
  const showIfFirstTime = async (): Promise<boolean> => {
    const uid = currentUser.value?.uid
    if (!uid || visible.value || evaluation.value[uid]) return false
    evaluation.value = { ...evaluation.value, [uid]: 'running' }
    const isCurrent = () => currentUser.value?.uid === uid
    // Waits for the profile (short timeout): never shown early, never shown twice. An open from
    // Impostazioni during the wait has recorded it: the evaluation re-reads this PC and stays closed.
    const result = await evaluateOnboarding(uid, onboardingDeps(uid, isCurrent, memory))
    if (result === 'cancelled') {
      // The account changed: nothing was decided for it, so it runs again when it comes back.
      if (evaluation.value[uid] === 'running') {
        evaluation.value = Object.fromEntries(Object.entries(evaluation.value).filter(([owner]) => owner !== uid))
      }
      return false
    }
    evaluation.value = { ...evaluation.value, [uid]: 'done' }
    if (result === 'closed' || !isCurrent() || visible.value) return false
    startPhase.value = 'tour'
    visible.value = true
    return true
  }

  /** Re-opens on demand (Impostazioni) from the first card, regardless of the status. */
  const open = async () => {
    const uid = currentUser.value?.uid
    if (uid) evaluation.value = { ...evaluation.value, [uid]: 'done' }
    startPhase.value = 'tour'
    visible.value = true
    openings.value++
    noteFeatureUse({ event: 'onboarding.opened', reason: REASON_CODE.manual, remote: 0 })
    // Seen on every PC of the account from now on.
    if (uid) void markOnboardingSeen(uid, onboardingDeps(uid, () => currentUser.value?.uid === uid, memory), { how: 'manual', blind: false }).catch(() => {})
  }

  /** Closes. Nothing to record: it was recorded as seen when it appeared, however it ends. */
  const close = () => { visible.value = false }

  /** PIP-749: the account changed while the window was open: it was not theirs, drop it. */
  const abandon = () => { visible.value = false }

  return { visible, startPhase, openings, showIfFirstTime, open, close, abandon }
}
