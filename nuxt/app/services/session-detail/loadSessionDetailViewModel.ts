import type { FullSession } from '~/composables/useTelemetryData'

export async function loadSessionDetailViewModel(params: {
  sessionId: string
  externalUserId?: string
  targetUserId?: string | null
  currentUser: { value: any }
  currentUserDisplayName?: string
  telemetryGateway: {
    getSessionDetail: (sessionId: string, targetUserId?: string, options?: { isCoachAccess?: boolean; warmupSessions?: boolean }) => Promise<FullSession | null>
  }
}): Promise<{ fullSession: FullSession | null; currentUserNickname: string; loadError: string | null; userIdToLoad?: string }> {
  const { sessionId, externalUserId, targetUserId, currentUser, currentUserDisplayName, telemetryGateway } = params

  const currentUserNickname = currentUserDisplayName || currentUser.value?.displayName || 'Tu'

  const userIdToLoad = externalUserId || targetUserId || undefined

  try {
    const fullSession = await telemetryGateway.getSessionDetail(sessionId, userIdToLoad, {
      isCoachAccess: !!targetUserId && !externalUserId,
      warmupSessions: false
    })

    if (!fullSession) {
      return {
        fullSession: null,
        currentUserNickname,
        loadError: 'Sessione non trovata',
        userIdToLoad
      }
    }

    return {
      fullSession,
      currentUserNickname,
      loadError: null,
      userIdToLoad
    }
  } catch (e: any) {
    return {
      fullSession: null,
      currentUserNickname,
      loadError: e.code === 'permission-denied'
        ? 'Sessione non condivisa o accesso negato'
        : (e.message || 'Errore caricamento'),
      userIdToLoad
    }
  }
}
