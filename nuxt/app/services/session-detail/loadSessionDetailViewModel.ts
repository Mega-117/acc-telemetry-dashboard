import type { FullSession } from '~/types/telemetry'
import type { SessionDetailUserIdentity } from '~/types/sessionDetailViewModel'
import { useI18n } from '~/i18n'

function getErrorDetails(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== 'object') return {}
  const record = error as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined
  }
}

export function getSessionDetailLoadError(error: unknown): string {
  const details = getErrorDetails(error)
  const { t } = useI18n()
  return details.code === 'permission-denied'
    ? t('sessionDetail.errors.denied')
    : (details.message || t('sessionDetail.errors.load'))
}

export async function loadSessionDetailViewModel(params: {
  sessionId: string
  externalUserId?: string
  targetUserId?: string | null
  currentUser: { value: SessionDetailUserIdentity | null | undefined }
  currentUserDisplayName?: string
  telemetryGateway: {
    getSessionDetail: (sessionId: string, targetUserId?: string, options?: { isCoachAccess?: boolean; warmupSessions?: boolean }) => Promise<FullSession | null>
  }
}): Promise<{ fullSession: FullSession | null; currentUserNickname: string; loadError: string | null; userIdToLoad?: string }> {
  const { sessionId, externalUserId, targetUserId, currentUser, currentUserDisplayName, telemetryGateway } = params

  const currentUserNickname = currentUserDisplayName || currentUser.value?.displayName || useI18n().t('sessionDetail.youName')

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
        loadError: useI18n().t('sessionDetail.errors.notFound'),
        userIdToLoad
      }
    }

    return {
      fullSession,
      currentUserNickname,
      loadError: null,
      userIdToLoad
    }
  } catch (error: unknown) {
    return {
      fullSession: null,
      currentUserNickname,
      loadError: getSessionDetailLoadError(error),
      userIdToLoad
    }
  }
}
