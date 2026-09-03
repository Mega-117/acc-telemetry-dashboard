/**
 * Quale vista del Pit Wall e' aperta, e se la campanella e' aperta.
 *
 * La vista nuova e' quella di default; `legacy` riporta alla pagina
 * precedente, tenuta intatta finche' l'utente non decide di toglierla.
 * `notificationsOpen` vive qui e non nella campanella perche' il TopBar e la
 * pagina la aprono da posti diversi.
 */
export function usePitwallConceptMode() {
  const legacy = useState<boolean>('pitwall-legacy-active', () => false)
  const notificationsOpen = useState<boolean>('pitwall-notifications-open', () => false)

  function setLegacy(next: boolean) {
    legacy.value = next
  }

  function toggleNotifications() {
    notificationsOpen.value = !notificationsOpen.value
  }

  function closeNotifications() {
    notificationsOpen.value = false
  }

  return { legacy, notificationsOpen, setLegacy, toggleNotifications, closeNotifications }
}
