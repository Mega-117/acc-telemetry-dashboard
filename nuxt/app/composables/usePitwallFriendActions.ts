// ============================================
// Le due azioni dell'amicizia, sopra i mattoncini che esistono gia'.
//
// Estratte dallo store live per tenerlo sotto il tetto di righe: qui c'e'
// solo cio' che si scrive quando l'utente preme Aggiungi/Accetta e
// Rifiuta/Annulla/Rimuovi. La logica di lettura (chi e' amico) sta in
// `pitwallFriends.ts`; qui si decide quali documenti toccare.
// ============================================

import type { Ref } from 'vue'
import { pitwallFriendActions, type PitwallFriendView } from '~/services/pitwall/pitwallFriends'
import type { PitwallRoom } from '~/services/pitwall/pitwallRoomContract'

export interface PitwallFriendActionDeps {
  uid: () => string | null
  friendViews: Ref<PitwallFriendView[]>
  trust: {
    preAuthorise: (uid: string, scope: 'always' | 'once', expiresAtMs: number | null) => Promise<unknown>
    requestLink: (uid: string, scope: 'always' | 'once') => Promise<unknown>
    decide: (uid: string, decision: 'granted' | 'revoked') => Promise<unknown>
    withdrawRequest: (uid: string) => Promise<unknown>
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
    await trust.preAuthorise(personId, 'always', null)
    if (!before?.theyAllow) await trust.requestLink(personId, 'always')
    link.notice.value = before?.theyAllow
      ? 'Adesso siete amici.'
      : 'Richiesta inviata: quando accetta, siete amici.'
  }

  /**
   * Sciogliere la relazione tocca solo i documenti che esistono, e toglie la
   * persona anche dalle mie gare aperte: `syncInvites` aggiunge soltanto, e
   * senza questo un ex amico resterebbe al muretto fino alla chiusura. Dalle
   * sue gare esco io: le regole non mi lasciano togliermi dagli invitati.
   */
  async function unfriend(personId: string): Promise<void> {
    const before = friendViews.value.find(view => view.personId === personId)
    const actions = pitwallFriendActions(before)
    if (actions.revokeMine) await trust.decide(personId, 'revoked')
    if (actions.withdrawTheirs) await trust.withdrawRequest(personId)
    // I servizi parlano di permessi; l'utente ha tolto un amico o una richiesta.
    link.notice.value = before?.state === 'friends' ? 'Non siete più amici.' : 'Richiesta annullata.'
    const me = uid()
    const service = link.service()
    if (!me || !service) return
    for (const room of link.rooms.value) {
      if (room.closedAt) continue
      if (room.hostUid === me) {
        if (room.allowedUids.includes(personId) || room.memberUids.includes(personId)) await service.revoke(room.roomId, personId)
      } else if (room.hostUid === personId && room.memberUids.includes(me)) {
        await service.leaveRoom(room.roomId)
      }
    }
  }

  return { befriend, unfriend }
}
