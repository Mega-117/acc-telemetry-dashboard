// ============================================
// Collegamento Pit Wall per il pannello dell'ingegnere.
//
// Tiene lo stato di cio' che serve alla pagina: quali piloti hanno concesso il
// collegamento, chi e' raggiungibile adesso, e com'e' andato l'ultimo ordine.
//
// Non applica nulla: l'autorita' e' il PC del pilota. Qui si invia e si
// osserva, e si dice sempre la verita' su cosa e' successo.
// ============================================

import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { db } from '~/config/firebase'
import { createPitwallEngineerService, type PitwallLinkedPilot } from '~/services/pitwall/pitwallEngineerService'
import {
  describePitwallOrderStatus,
  isPitwallOrderSettled,
  type PitwallOrderStatus,
} from '~/services/pitwall/pitwallLink'

export interface PitwallLinkOptions {
  /** Uid dell'ingegnere collegato. Null finche' non e' autenticato. */
  engineerUid: () => string | null
}

export function usePitwallLink(options: PitwallLinkOptions) {
  const pilots = ref<PitwallLinkedPilot[]>([])
  const selectedDriverUid = ref<string | null>(null)
  const loading = ref(false)
  const sending = ref(false)
  const lastError = ref<string | null>(null)

  const orderId = ref<string | null>(null)
  const orderStatus = ref<PitwallOrderStatus | null>(null)
  const orderReason = ref<string | null>(null)
  // Ogni invio incrementa la revisione: il PC del pilota scarta un ordine
  // vecchio arrivato in ritardo invece di tornare indietro nel tempo.
  const revision = ref(0)

  const serviceRef = shallowRef<ReturnType<typeof createPitwallEngineerService> | null>(null)
  let stopOrderWatch: (() => void) | null = null

  function service() {
    const uid = options.engineerUid()
    if (!uid) return null
    if (!serviceRef.value) serviceRef.value = createPitwallEngineerService({ db, engineerUid: uid })
    return serviceRef.value
  }

  const selectedPilot = computed(
    () => pilots.value.find(pilot => pilot.driverUid === selectedDriverUid.value) ?? null
  )
  const canSend = computed(() => Boolean(selectedPilot.value?.reachable) && !sending.value)
  const orderProgress = computed(() => describePitwallOrderStatus(orderStatus.value))

  async function refreshPilots(): Promise<void> {
    const engineer = service()
    if (!engineer) {
      pilots.value = []
      return
    }
    loading.value = true
    lastError.value = null
    try {
      pilots.value = await engineer.listLinkedPilots()
      if (selectedDriverUid.value && !pilots.value.some(p => p.driverUid === selectedDriverUid.value)) {
        // Il collegamento e' stato revocato mentre la pagina era aperta.
        selectPilot(null)
      }
    } catch (error) {
      lastError.value = (error as Error)?.message || 'Elenco piloti non disponibile.'
      pilots.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Sceglie il pilota da assistere e ne rilegge subito la presenza.
   *
   * La presenza si rilegge invece di ascoltarla: cambia lentamente e un
   * listener costerebbe di piu' senza dire nulla di piu'.
   */
  function selectPilot(driverUid: string | null): void {
    selectedDriverUid.value = driverUid
    if (!driverUid) return
    const engineer = service()
    if (!engineer) return
    void engineer.readPilotPresence(driverUid).then(({ session, reachable }) => {
      pilots.value = pilots.value.map(pilot => (
        pilot.driverUid === driverUid ? { ...pilot, session, reachable } : pilot
      ))
    })
  }

  async function requestLink(driverUid: string, note: string | null = null): Promise<boolean> {
    const engineer = service()
    if (!engineer) {
      lastError.value = 'Devi essere collegato al tuo account.'
      return false
    }
    const result = await engineer.requestLink(driverUid, note)
    if (!result.ok) {
      lastError.value = result.reason
      return false
    }
    await refreshPilots()
    return true
  }

  /**
   * Invia la strategia al pilota selezionato e segue l'ordine fino all'esito.
   * Non dichiara mai riuscito cio' che non e' stato confermato dal suo PC.
   */
  async function sendPlan(plan: Record<string, unknown>): Promise<boolean> {
    const engineer = service()
    const driverUid = selectedDriverUid.value
    if (!engineer || !driverUid) {
      lastError.value = 'Nessun pilota selezionato.'
      return false
    }

    sending.value = true
    lastError.value = null
    orderReason.value = null
    try {
      revision.value += 1
      const sent = await engineer.sendOrder({ driverUid, plan, revision: revision.value })
      if (!sent.ok) {
        lastError.value = sent.reason
        orderStatus.value = 'rejected'
        return false
      }

      orderId.value = sent.orderId
      orderStatus.value = 'pending'
      stopOrderWatch?.()
      stopOrderWatch = engineer.watchOrder(driverUid, sent.orderId, (document) => {
        if (!document) return
        orderStatus.value = document.status
        const result = document.result as { reason?: string | null } | undefined
        orderReason.value = result?.reason ?? null
        if (isPitwallOrderSettled(document.status)) {
          stopOrderWatch?.()
          stopOrderWatch = null
        }
      })
      return true
    } finally {
      sending.value = false
    }
  }

  function stop(): void {
    stopOrderWatch?.()
    stopOrderWatch = null
  }

  onScopeDispose(stop)

  return {
    pilots,
    selectedDriverUid,
    selectedPilot,
    loading,
    sending,
    canSend,
    lastError,
    orderId,
    orderStatus,
    orderReason,
    orderProgress,
    refreshPilots,
    selectPilot,
    requestLink,
    sendPlan,
    stop,
  }
}
