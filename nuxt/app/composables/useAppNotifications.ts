export type AppNotificationType = 'success' | 'error' | 'info'

export interface AppNotification {
  id: number
  text: string
  type: AppNotificationType
}

let notificationSeq = 0
const notificationTimers = new Map<number, ReturnType<typeof setTimeout>>()

export function useAppNotifications() {
  const notifications = useState<AppNotification[]>('app-notifications', () => [])

  function dismiss(id: number) {
    const timer = notificationTimers.get(id)
    if (timer) clearTimeout(timer)
    notificationTimers.delete(id)
    notifications.value = notifications.value.filter(item => item.id !== id)
  }

  function push(text: string, type: AppNotificationType = 'info', durationMs = 5000) {
    const id = ++notificationSeq
    notifications.value = [...notifications.value, { id, text, type }]
    const timer = setTimeout(() => dismiss(id), durationMs)
    notificationTimers.set(id, timer)
    return id
  }

  return {
    notifications,
    push,
    dismiss,
  }
}
