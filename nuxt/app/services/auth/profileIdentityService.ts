// PIP-659: change name, surname and nickname from the Profile. One write per place that shows them, all
// derived from the same values: users (private profile + search fields), publicProfiles (nickname others see),
// pilotDirectory (coach/admin lists, rebuilt from users), the Auth display name. Email and password reuse
// the existing flows (verifyBeforeUpdateEmail, reset email) in authService.
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { updateProfile, type User } from 'firebase/auth'
import { db } from '~/config/firebase'
import { rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import { rememberPublicNickname } from '~/repositories/publicProfileRepository'
import { repairPilotDirectoryFromUser } from '~/services/pilotDirectoryProjectionService'
import { buildPilotDirectoryFields } from '~/utils/pilotDirectoryFields'

export interface ProfileNames { firstName: string, lastName: string, nickname: string }

/** The same checks as registration, so a profile cannot become something registration would refuse. */
export function validateProfileNames(input: ProfileNames): string | null {
  if (!input.firstName.trim()) return 'Inserisci il tuo nome.'
  if (!input.lastName.trim()) return 'Inserisci il tuo cognome.'
  const nick = input.nickname.trim()
  if (nick.length < 3) return 'Il nickname deve essere di almeno 3 caratteri.'
  if (nick.length > 20) return 'Il nickname può avere al massimo 20 caratteri.'
  return null
}

export function profileNamesPatch(input: ProfileNames, email: string | null) {
  const names = { firstName: input.firstName.trim(), lastName: input.lastName.trim(), nickname: input.nickname.trim() }
  return { ...names, ...buildPilotDirectoryFields({ ...names, email }) }
}

export async function saveProfileNames(user: User, input: ProfileNames, previousNickname: string | null) {
  const error = validateProfileNames(input)
  if (error) throw new Error(error)
  const patch = profileNamesPatch(input, user.email)
  await updateDoc(doc(db, 'users', user.uid), patch)
  rememberOwnerDocumentPatch(user.uid, patch)
  if (patch.nickname !== previousNickname) {
    await updateDoc(doc(db, 'publicProfiles', user.uid), { nickname: patch.nickname, updatedAt: new Date().toISOString() })
    rememberPublicNickname(user.uid, patch.nickname)
    await updateProfile(user, { displayName: patch.nickname }).catch(() => { /* cosmetic: Firestore is the source */ })
  }
  await repairPilotDirectoryFromUser({ db, uid: user.uid, setDocFn: setDoc })
  return patch
}
