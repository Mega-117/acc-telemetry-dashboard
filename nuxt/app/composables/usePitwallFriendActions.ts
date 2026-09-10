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

export interface PitwallFriendActionDeps {
  uid: () => string | null
  friendViews: Ref<PitwallFriendView[]>
  trust: {
    preAuthorise: (uid: string, scope: 'always' | 'once', expiresAtMs: number | null) => Promise<boolean>
    requestLink: (uid: string, scope: 'always' | 'once') => Promise<boolean>
    decide: (uid: string, decision: 'granted' | 'revoked') => Promise<boolean>
    withdrawRequest: (uid: string) => Promise<boolean>
  }
  link: {
    rooms: Ref<PitwallRoom[]>
    notice: Ref<string | null>
    service: () => { revoke: (roomId: string, uid: string) => Promise<unknown>, leaveRoom: (roomId: string) => Promise<unknown> } | null
  }
}

export function createPitwallFriendActions({ uid, friendViews, trust, link }: PitwallFriendActionDeps) {
  /**
   * Chiedere e accettare sono la stessa scrittura: autorizzo io (`me__X`) e
   * chiedo a lui (`X__me`). Se lui aveva gia' autorizzato me, siamo amici
   * adesso; altrimenti la sua parte arriva quando accetta.
   */
  async function befriend(personId: string): Promise<void> {
    const before = friendViews.value.find(view => view.personId === personId) ?? null
    link.notice.value = null
    const context = { uid: uid() ?? undefined, peerUid: personId }
    if (!await trust.preAuthorise(personId, 'always', null)) { emitPitwallDiagnostic('friend_failed', context); return }
    if (!before?.theyAllow && !await trust.requestLink(personId, 'always')) { emitPitwallDiagnostic('friend_failed', context); return }
    emitPitwallDiagnostic(before?.theyAllow ? 'friend_accepted' : 'friend_requested', context)
    link.notice.value = before?.theyAllow
      ? null
      : 'Richiesta inviata: quando accetta, siete amici.'
  }

  /** Revoca il rapporto sociale; chi e' gia' nella stanza rimane. */
  async function unfriend(personId: string): Promise<void> {
    const before = friendViews.value.find(view => view.personId === personId)
    const actions = pitwallFriendActions(before)
    link.notice.value = null
    if (actions.revokeMine && !await trust.decide(personId, 'revoked')) return
    if (actions.withdrawTheirs && !await trust.withdrawRequest(personId)) return
    // I servizi parlano di permessi; l'utente ha tolto un amico o una richiesta.
    link.notice.value = before?.state === 'friends' ? 'Non siete più amici.' : 'Richiesta annullata.'
    emitPitwallDiagnostic('friend_revoked', { uid: uid() ?? undefined, peerUid: personId })

  }

  return { befriend, unfriend }
}
