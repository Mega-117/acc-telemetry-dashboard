// ============================================
// Recupero degli esiti della Race Room (PIP-367).
//
// Il processo main posa su disco ogni esito applicato ad ACC prima di
// restituirlo al renderer; qui si pubblicano quelli che il cloud non ha mai
// saputo e si dice al main di dimenticarli, solo a consegna avvenuta. Non si
// tocca ACC: si racconta cio' che e' gia' successo.
//
// Estratto dal lato pilota della stanza perche' e' l'unico pezzo che non
// dipende dall'intento del pilota ne' dalla vettura: un esito in sospeso
// riguarda una gara che potrebbe essere finita ieri.
// ============================================

import type { PitwallRoomService } from './pitwallRoomService'
import type { PitwallDriverElectronApi, PitwallPendingOutcome } from './pitwallDriverLinkService'

export interface PitwallRoomOutcomeRecoveryOptions {
  uid: string
  electronApi: PitwallDriverElectronApi
  rooms: Pick<PitwallRoomService, 'publishOutcome' | 'readOrder'>
  log: Pick<Console, 'warn' | 'error'>
  /** Il lato pilota si e' fermato: non si pubblica piu' niente. */
  isStopped: () => boolean
}

export function createPitwallRoomOutcomeRecovery(options: PitwallRoomOutcomeRecoveryOptions) {
  const { uid, electronApi, rooms, log, isStopped } = options

  /** Dice al processo main di dimenticare: si chiama solo a consegna avvenuta. */
  async function confirmOutcomes(orderIds: string[]): Promise<void> {
    if (!orderIds.length) return
    try {
      await electronApi.pitwallConfirmOutcomes?.(orderIds)
    } catch (error) {
      // Il record resta: al prossimo giro si scoprira' che l'ordine e' gia'
      // terminale e si chiudera' li'. Meglio un tentativo di troppo che una
      // verita' cancellata senza prova.
      log.warn?.('[PITWALL] conferma esito non registrata:', (error as Error)?.message)
    }
  }

  /**
   * Pubblica gli esiti che ACC ha gia' applicato ma il cloud non ha mai saputo.
   *
   * E' la differenza fra recuperare una verita' e rifare una strategia a
   * situazione cambiata, che sarebbe il peggior modo di fallire.
   */
  async function drainPendingOutcomes(): Promise<void> {
    if (isStopped() || !electronApi.pitwallPendingOutcomes) return
    let outcomes: PitwallPendingOutcome[] = []
    try {
      outcomes = await electronApi.pitwallPendingOutcomes() ?? []
    } catch (error) {
      log.warn?.('[PITWALL] esiti in attesa non leggibili:', (error as Error)?.message)
      return
    }

    for (const outcome of outcomes) {
      if (isStopped()) return
      // Un esito applicato da un altro account su questo computer non e'
      // nostro da pubblicare: le regole accettano l'esito solo da chi aveva
      // preso in carico l'ordine.
      if (outcome.driverUid && outcome.driverUid !== uid) continue

      const published = await rooms.publishOutcome(outcome.roomId, outcome.orderId, {
        status: outcome.status,
        reason: outcome.reason,
        fields: outcome.fields,
      })
      if (published.ok) {
        await confirmOutcomes([outcome.orderId])
        continue
      }

      // Rifiutato: o il cloud non risponde, o lassu' l'ordine e' gia'
      // concluso - le regole accettano l'esito solo finche' e' `applying`.
      // Le due cose si distinguono solo leggendo, e la differenza conta: nel
      // secondo caso ritentare all'infinito qualcosa di gia' fatto.
      const current = await rooms.readOrder(outcome.roomId, outcome.orderId)
      if (!current.ok) continue
      const stillOpen = current.value && (current.value.status === 'pending' || current.value.status === 'applying')
      if (!stillOpen) await confirmOutcomes([outcome.orderId])
    }
  }

  return { confirmOutcomes, drainPendingOutcomes }
}
