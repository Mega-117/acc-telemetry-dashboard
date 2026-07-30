import type { RuntimeBootstrapResult } from './runtimeBootstrapCoordinator'

export const RUNTIME_WINDOW_SCHEMA_VERSION = 1 as const

export interface RuntimeWindowSnapshot {
  schemaVersion: 1
  lifecycle: 'starting' | 'ready' | 'degraded' | 'stopped'
  phase: string
  capabilities: Record<string, unknown>
  reasonCode: string | null
  lastEvent: {
    kind: string
    code: string
    phase: string
  } | null
  updatedAt?: string
}

export interface RuntimeWindowElectronApi {
  runtimeBootstrapRole?: 'owner' | 'consumer'
  publishRuntimeBootstrapState?: (snapshot: RuntimeWindowSnapshot) => Promise<unknown>
  getRuntimeBootstrapState?: () => Promise<RuntimeWindowSnapshot>
  requestRuntimeBootstrapCommand?: (command: {
    schemaVersion: 1
    type: 'manual-sync'
  }) => Promise<{
    schemaVersion: 1
    status: 'accepted' | 'rejected' | 'unavailable'
    reasonCode: string | null
  }>
  onRuntimeBootstrapState?: (callback: (snapshot: RuntimeWindowSnapshot) => void) => (() => void)
}

export function isRuntimeWindowOwner(api: RuntimeWindowElectronApi | null | undefined): boolean {
  return api?.runtimeBootstrapRole === 'owner'
}

export function buildRuntimeWindowSnapshot(
  state: RuntimeBootstrapResult<unknown>,
  lifecycle: RuntimeWindowSnapshot['lifecycle'] = 'ready'
): RuntimeWindowSnapshot {
  const event = state.events[state.events.length - 1]
  return {
    schemaVersion: RUNTIME_WINDOW_SCHEMA_VERSION,
    lifecycle,
    phase: state.phase,
    capabilities: state.capabilities as unknown as Record<string, unknown>,
    reasonCode: lifecycle === 'degraded' ? event?.code || 'bootstrap_degraded' : null,
    lastEvent: event
      ? { kind: event.kind, code: event.code, phase: event.phase }
      : null
  }
}

export async function publishRuntimeWindowSnapshot(
  api: RuntimeWindowElectronApi | null | undefined,
  state: RuntimeBootstrapResult<unknown>
): Promise<boolean> {
  if (!isRuntimeWindowOwner(api) || !api?.publishRuntimeBootstrapState) return false
  await api.publishRuntimeBootstrapState(
    buildRuntimeWindowSnapshot(state, state.phase === 'degraded' ? 'degraded' : 'ready')
  )
  return true
}

export async function requestRuntimeWindowManualSync(
  api: RuntimeWindowElectronApi | null | undefined
) {
  if (isRuntimeWindowOwner(api) || !api?.requestRuntimeBootstrapCommand) return null
  return api.requestRuntimeBootstrapCommand({
    schemaVersion: RUNTIME_WINDOW_SCHEMA_VERSION,
    type: 'manual-sync'
  })
}
