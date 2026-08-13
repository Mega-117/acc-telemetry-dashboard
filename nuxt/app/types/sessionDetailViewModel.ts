import type { FullSession } from '~/types/telemetry'

export interface SessionDetailViewModel {
  sessionId: string
  userId?: string
  isShared: boolean
  isCoachAccess: boolean
  isLoading: boolean
  loadError: string | null
  currentUserNickname: string
  fullSession: FullSession | null
}
