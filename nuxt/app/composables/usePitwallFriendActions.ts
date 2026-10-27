// ============================================
// Le due azioni dell'amicizia, sopra i mattoncini che esistono gia'.
//
// Estratte dallo store live per tenerlo sotto il tetto di righe: qui c'e'
// solo cio' che si scrive quando l'utente preme Aggiungi/Accetta e
// Rifiuta/Annulla/Rimuovi. La logica di lettura (chi e' amico) sta in
// `pitwallFriends.ts`; qui si decide quali documenti toccare.
// ============================================

import type { Ref } from 'vue'
import { emitPitwallDiagnostic } from '~/services/pitwall/pitwallDiagnostics'
import { pitwallFriendActions, type PitwallFriendView } from '~/services/pitwall/pitwallFriends'
import type { PitwallRoom } from '~/services/pitwall/pitwallRoomContract'
import type { PitwallRequestPointers } from '~/services/pitwall/pitwallNotificationInbox'

/** PIP-561: an action answers yes/no or, better, its own outcome with a reason code. */
type ActionResult = boolean | { ok: boolean, code: string | null, afterCooldown?: boolean }
const outcome = (value: ActionResult) => typeof value === 'boolean' ? { ok: value, code: value ? null : 'unknown', afterCooldown: false } : value

export interface PitwallFriendActionDeps {
  uid: () => string | null
  friendViews: Ref<PitwallFriendView[]>
  trust: {
    preAuthorise: (uid: string, scope: 'always' | 'once', expiresAtMs: number | null) => Promise<ActionResult>
    requestLink: (uid: string, scope: 'always' | 'once') => Promise<ActionResult>
    decide: (uid: string, decision: 'granted' | 'revoked') => Promise<ActionResult>
    withdrawRequest: (uid: string) => Promise<ActionResult>
  }
  link: {
    rooms: Ref<PitwallRoom[]>
    notice: Ref<string | null>
    service: () => { revoke: (roomId: string, uid: string) => Promise<unknown>, leaveRoom: (roomId: string) => Promise<unknown> } | null
  }
  /** Decision 27/10: the bell's Firestore pointers, written after the Realtime Database (best effort). */
  pointers?: PitwallRequestPointers
}

export function createPitwallFriendActions({ uid, friendViews, trust, link, pointers }: PitwallFriendActionDeps) {
  /**
   * Chiedere e accettare sono la stessa scrittura: autorizzo io (`me__X`) e
   * chiedo a lui (`X__me`). Se lui aveva gia' autorizzato me, siamo amici
   * adesso; altrimenti la sua parte arriva quando accetta.
   */
  async function befriend(personId: string, before = friendViews.value.find(view => view.personId === personId) ?? null): Promise<boolean> {
    const account = uid()
    if (!account) return false
    link.notice.value = null
    const context = { uid: uid() ?? undefined, peerUid: personId, operation: 'request' as const }
    const failed = (code: string | null) => emitPitwallDiagnostic('friend_failed', { ...context, code: code ?? 'unknown' })
    const authorised = outcome(await trust.preAuthorise(personId, 'always', null))
    if (!authorised.ok || uid() !== account) { if (!authorised.ok) failed(authorised.code); return false }
    const requested = before?.theyAllow ? null : outcome(await trust.requestLink(personId, 'always'))
    if (requested && !requested.ok) { failed(requested.code); return false }
    if (uid() !== account) return false
    // Their request is answered (my pointer from them goes); a new request of mine rings their bell.
    if (before?.theyAllow) void pointers?.answered(personId)
    if (requested) void pointers?.sent(personId)
    emitPitwallDiagnostic(before?.theyAllow ? 'friend_accepted' : 'friend_requested',
      { ...context, afterCooldown: requested?.afterCooldown === true })
    link.notice.value = before?.theyAllow
      ? null
      : 'Richiesta inviata: quando accetta, siete amici.'
    return true
  }

  /** Revoca il rapporto sociale; chi e' gia' nella stanza rimane. */
  async function unfriend(personId: string, before = friendViews.value.find(view => view.personId === personId)): Promise<boolean> {
    const account = uid()
    if (!account) return false
    const actions = pitwallFriendActions(before)
    link.notice.value = null
    const context = { uid: uid() ?? undefined, peerUid: personId, operation: 'close' as const }
    // PIP-561: a refused close (e.g. old client against the 24 h Rules) must leave a trace.
    const failed = (code: string | null) => emitPitwallDiagnostic('friend_failed', { ...context, code: code ?? 'unknown' })
    if (actions.revokeMine) {
      const revoked = outcome(await trust.decide(personId, 'revoked'))
      if (!revoked.ok) { failed(revoked.code); return false }
    }
    if (uid() !== account) return false
    if (actions.withdrawTheirs) {
      const withdrawn = outcome(await trust.withdrawRequest(personId))
      if (!withdrawn.ok) { failed(withdrawn.code); return false }
    }
    if (uid() !== account) return false
    // Declining their request removes its pointer from my inbox; cancelling mine removes it from theirs.
    if (actions.revokeMine && before?.state === 'received') void pointers?.answered(personId)
    if (actions.withdrawTheirs && before?.state === 'sent') void pointers?.withdrawn(personId)
    // I servizi parlano di permessi; l'utente ha tolto un amico o una richiesta.
    link.notice.value = before?.state === 'friends' ? 'Non siete più amici.' : 'Richiesta annullata.'
    // Only a close that actually wrote something counts as accepted by the Rules.
    if (actions.revokeMine || actions.withdrawTheirs) emitPitwallDiagnostic('friend_revoked', context)
    return true
  }

  return { befriend, unfriend }
}
