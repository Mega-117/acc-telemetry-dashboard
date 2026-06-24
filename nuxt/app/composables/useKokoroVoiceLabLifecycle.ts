import { useAppNotifications } from './useAppNotifications'

const VOICE_LAB_PATH = '/dev-voice-lab'
const VOICE_LAB_MARKER = 'kokoro-voice-lab-active'
const KOKORO_IDLE_SHUTDOWN_MS = 10_000

let idleShutdownHandle: ReturnType<typeof setTimeout> | null = null

function isVoiceLabPathActive() {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/+$/, '') === VOICE_LAB_PATH
}

export function useKokoroVoiceLabLifecycle() {
  const isVoiceLabActive = useState('kokoro-voice-lab-active', () => false)
  const workCount = useState('kokoro-voice-lab-work-count', () => 0)
  const { push } = useAppNotifications()
  const voiceLabRuntime = useVoiceLabRuntime()

  function cancelShutdown() {
    if (idleShutdownHandle) {
      clearTimeout(idleShutdownHandle)
      idleShutdownHandle = null
    }
  }

  function isWorking() {
    return workCount.value > 0
  }

  function enterVoiceLab() {
    isVoiceLabActive.value = true
    if (typeof window !== 'undefined') sessionStorage.setItem(VOICE_LAB_MARKER, '1')
    cancelShutdown()
  }

  function scheduleShutdown(reason = 'idle') {
    if (isVoiceLabActive.value || isVoiceLabPathActive() || isWorking()) return

    cancelShutdown()
    push('Kokoro si spegnera tra 10 secondi.', 'info')
    idleShutdownHandle = setTimeout(async () => {
      idleShutdownHandle = null
      if (isVoiceLabActive.value || isVoiceLabPathActive() || isWorking()) return
      try {
        const result = await voiceLabRuntime.kokoroStop() as { status: string; message?: string }
        if (result.status === 'stopped' || result.status === 'already-stopped' || result.status === 'offline') {
          push('Motore vocale Kokoro spento.', 'success')
          return
        }
        if (result.status === 'skipped') {
          push(result.message || 'Kokoro non spento: processo non gestito da ACC Suite.', 'info')
        }
      } catch (error: any) {
        push(`Spegnimento Kokoro non riuscito: ${error?.data?.statusMessage || error?.message || 'errore'}`, 'error')
      }
    }, KOKORO_IDLE_SHUTDOWN_MS)
  }

  function leaveVoiceLab() {
    isVoiceLabActive.value = false
    if (typeof window !== 'undefined') sessionStorage.removeItem(VOICE_LAB_MARKER)
    if (isWorking()) return
    scheduleShutdown('leave')
  }

  function resumePendingLeaveIfNeeded() {
    if (typeof window === 'undefined') return
    if (isVoiceLabPathActive()) return
    if (sessionStorage.getItem(VOICE_LAB_MARKER) !== '1') return
    sessionStorage.removeItem(VOICE_LAB_MARKER)
    isVoiceLabActive.value = false
    scheduleShutdown('resume-leave')
  }

  function beginWork() {
    workCount.value += 1
    cancelShutdown()
  }

  function endWork() {
    workCount.value = Math.max(0, workCount.value - 1)
    if (!isVoiceLabActive.value && !isVoiceLabPathActive()) scheduleShutdown('work-complete')
  }

  return {
    beginWork,
    cancelShutdown,
    endWork,
    enterVoiceLab,
    leaveVoiceLab,
    resumePendingLeaveIfNeeded,
    scheduleShutdown,
  }
}
