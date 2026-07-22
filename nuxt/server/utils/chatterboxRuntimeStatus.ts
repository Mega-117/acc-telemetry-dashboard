import { getManagedChatterboxPid } from './chatterboxProcessRegistry'

export const CHATTERBOX_URL = 'http://127.0.0.1:5121'
export type ChatterboxState = 'online' | 'starting' | 'offline' | 'error'

export interface ChatterboxRuntimeStatus {
  state: ChatterboxState
  message?: string
  managed?: boolean
  managedPid?: number | null
}

export async function readChatterboxRuntimeStatus(): Promise<ChatterboxRuntimeStatus> {
  try {
    const response = await fetch(`${CHATTERBOX_URL}/ready`, { signal: AbortSignal.timeout(2000) })
    const data = await response.json().catch(() => null)
    const managedPid = getManagedChatterboxPid()
    const message = data?.readiness?.error || data?.readiness?.message || data?.error
    if (response.ok && data?.ok) {
      return { state: 'online', message, managed: Boolean(managedPid), managedPid }
    }
    if (response.status === 503) return { state: 'starting', message, managed: Boolean(managedPid), managedPid }
    return { state: 'error', message: message || `HTTP ${response.status}`, managed: Boolean(managedPid), managedPid }
  } catch (error: any) {
    return { state: 'offline', message: error?.message }
  }
}
