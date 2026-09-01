export function usePitwallConceptMode() {
  const active = useState<boolean>('pitwall-concept-active', () => false)
  const notificationsOpen = useState<boolean>('pitwall-concept-notifications-open', () => false)

  function setActive(next: boolean) {
    active.value = next
    if (!next) notificationsOpen.value = false
  }

  function toggleNotifications() {
    notificationsOpen.value = !notificationsOpen.value
  }

  return { active, notificationsOpen, setActive, toggleNotifications }
}
