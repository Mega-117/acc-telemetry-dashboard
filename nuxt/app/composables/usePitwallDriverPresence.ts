// ============================================
// Lato pilota del Pit Wall, dentro la finestra runtime.
//
// La finestra runtime e' l'unico renderer con accesso a Firestore e l'unico
// autorizzato a consegnare un ordine ad ACC: e' quindi il posto giusto per
// annunciare che il pilota e' in pista e per ascoltare gli ordini in arrivo.
//
// Se non siamo in quella finestra, questo composable non fa niente. Non e' una
// precauzione cosmetica: partire altrove aprirebbe ascolti duplicati e farebbe
// arrivare lo stesso ordine due volte.
// ============================================

import { onScopeDispose, ref, watch } from 'vue'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  startPitwallDriverLink,
  type PitwallDriverElectronApi,
  type PitwallDriverLinkHandle,
} from '~/services/pitwall/pitwallDriverLinkService'

function runtimeElectronApi(): (PitwallDriverElectronApi & { runtimeBootstrapRole?: string }) | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { electronAPI?: PitwallDriverElectronApi & { runtimeBootstrapRole?: string } })
    .electronAPI ?? null
}

/** Identifica questa esecuzione dell'app: cambia a ogni avvio. */
function newSessionId(): string {
  return `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function usePitwallDriverPresence() {
  const { currentUser } = useFirebaseAuth()
  const active = ref(false)
  const unavailableReason = ref<string | null>(null)
  let handle: PitwallDriverLinkHandle | null = null

  function stop(): void {
    if (!handle) return
    void handle.goOffline()
    handle.stop()
    handle = null
    active.value = false
  }

  function start(driverUid: string): void {
    const electronApi = runtimeElectronApi()
    if (!electronApi?.pitwallSubmitRemoteOrder) {
      // Fuori dalla finestra runtime, o su un browser normale: qui il pilota
      // non c'e' e non va annunciato.
      unavailableReason.value = 'Il collegamento pilota vive solo nella finestra runtime della suite.'
      return
    }
    unavailableReason.value = null
    handle = startPitwallDriverLink({
      db,
      driverUid,
      sessionId: newSessionId(),
      electronApi,
    })
    active.value = true
  }

  // Un cambio account chiude il collegamento precedente prima di aprirne uno
  // nuovo: la presenza del pilota di prima non deve restare accesa.
  watch(
    () => currentUser.value?.uid ?? null,
    (uid) => {
      stop()
      if (uid) start(uid)
    },
    { immediate: true }
  )

  onScopeDispose(stop)

  return { active, unavailableReason, stop }
}
