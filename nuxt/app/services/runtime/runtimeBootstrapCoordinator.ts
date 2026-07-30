import {
  resolveRuntimeBootstrapCapabilities,
  type RuntimeAuthState,
  type RuntimeBootstrapCapabilities,
  type RuntimeHealthState,
  type RuntimeMigrationCompatibility,
  type RuntimeNetworkState
} from './runtimeBootstrapPolicy'

export type RuntimeBootstrapPhase =
  | 'idle'
  | 'offline'
  | 'auth_pending'
  | 'checking_update'
  | 'restart_required'
  | 'migrating'
  | 'syncing'
  | 'ready'
  | 'degraded'

export type RuntimeBootstrapEventKind = 'progress' | 'native_notification' | 'diagnostic'

export interface RuntimeBootstrapEvent {
  schemaVersion: 1
  id: string
  coordinatorKey: string
  kind: RuntimeBootstrapEventKind
  code: string
  phase: RuntimeBootstrapPhase
  occurredAt: string
  notifyNative: boolean
  openUi: false
  details?: Record<string, unknown>
}

export interface RuntimeBootstrapContext {
  coordinatorKey: string
  network: RuntimeNetworkState
  auth: RuntimeAuthState
  health: RuntimeHealthState
  compatibility?: RuntimeMigrationCompatibility
}

export interface RuntimeUpdateResult {
  status: 'current' | 'updated_restart_required' | 'failed'
  errorCode?: string
}

export interface RuntimeMigrationResult {
  status: 'healthy' | 'partial' | 'waiting_for_lease' | 'blocked' | 'future_schema'
  persistent?: boolean
  errorCode?: string
}

export interface RuntimeBootstrapOperations<TSyncResult> {
  checkUpdate: () => Promise<RuntimeUpdateResult>
  migrate: () => Promise<RuntimeMigrationResult>
  sync: () => Promise<TSyncResult>
  onEvent?: (event: RuntimeBootstrapEvent) => void | Promise<void>
}

export interface RuntimeBootstrapResult<TSyncResult> {
  phase: RuntimeBootstrapPhase
  capabilities: RuntimeBootstrapCapabilities
  events: RuntimeBootstrapEvent[]
  syncResult?: TSyncResult
}

export interface RuntimeBootstrapCoordinator {
  run<TSyncResult>(
    context: RuntimeBootstrapContext,
    operations: RuntimeBootstrapOperations<TSyncResult>
  ): Promise<RuntimeBootstrapResult<TSyncResult>>
  invalidate(coordinatorKey: string): void
  getSnapshot(): RuntimeBootstrapResult<unknown>
}

export function createRuntimeBootstrapCoordinator(): RuntimeBootstrapCoordinator {
  const inFlight = new Map<string, Promise<RuntimeBootstrapResult<unknown>>>()
  const epochs = new Map<string, number>()
  const notifiedThisBoot = new Set<string>()
  let sequence = 0
  let snapshot: RuntimeBootstrapResult<unknown> = {
    phase: 'idle',
    capabilities: resolveRuntimeBootstrapCapabilities({
      network: 'offline', auth: 'pending', health: 'unknown'
    }),
    events: []
  }

  async function execute<TSyncResult>(
    context: RuntimeBootstrapContext,
    operations: RuntimeBootstrapOperations<TSyncResult>,
    epoch: number
  ): Promise<RuntimeBootstrapResult<TSyncResult>> {
    const events: RuntimeBootstrapEvent[] = []
    let health = context.health

    const emit = async (
      kind: RuntimeBootstrapEventKind,
      code: string,
      phase: RuntimeBootstrapPhase,
      options: { notifyNative?: boolean; details?: Record<string, unknown> } = {}
    ) => {
      const notificationKey = `${context.coordinatorKey}:${code}`
      const notifyNative = options.notifyNative === true && !notifiedThisBoot.has(notificationKey)
      if (notifyNative) notifiedThisBoot.add(notificationKey)
      const event: RuntimeBootstrapEvent = {
        schemaVersion: 1,
        id: `${context.coordinatorKey.slice(0, 16)}:${++sequence}:${code}`,
        coordinatorKey: context.coordinatorKey,
        kind: notifyNative ? 'native_notification' : kind,
        code,
        phase,
        occurredAt: new Date().toISOString(),
        notifyNative,
        openUi: false,
        details: options.details
      }
      events.push(event)
      try {
        await operations.onEvent?.(event)
      } catch {
        // Diagnostic I/O must never stop the local runtime.
      }
    }

    const finish = (phase: RuntimeBootstrapPhase, syncResult?: TSyncResult) => {
      const result: RuntimeBootstrapResult<TSyncResult> = {
        phase,
        capabilities: resolveRuntimeBootstrapCapabilities({ ...context, health }),
        events,
        syncResult
      }
      if ((epochs.get(context.coordinatorKey) || 0) === epoch) snapshot = result
      return result
    }

    if (context.network === 'offline') {
      await emit('progress', 'cloud_deferred_offline', 'offline')
      return finish('offline')
    }
    if (context.auth !== 'ready') {
      await emit('progress', 'cloud_deferred_auth', 'auth_pending')
      return finish('auth_pending')
    }

    await emit('progress', 'update_check_started', 'checking_update')
    let update: RuntimeUpdateResult
    try {
      update = await operations.checkUpdate()
    } catch (error) {
      update = { status: 'failed', errorCode: error instanceof Error ? error.message : 'update_check_failed' }
    }
    if (update.status === 'updated_restart_required') {
      await emit('progress', 'restart_required', 'restart_required')
      return finish('restart_required')
    }
    if (update.status === 'failed') {
      await emit('diagnostic', 'update_failed_current_runtime_continues', 'degraded', {
        notifyNative: true,
        details: { errorCode: update.errorCode || 'update_failed' }
      })
    }

    await emit('progress', 'migration_started', 'migrating')
    let migration: RuntimeMigrationResult
    try {
      migration = await operations.migrate()
    } catch (error) {
      migration = {
        status: 'blocked',
        persistent: true,
        errorCode: error instanceof Error ? error.message : 'migration_failed'
      }
    }
    health = migration.status === 'waiting_for_lease' ? 'repairing' : migration.status

    if (migration.status === 'blocked' || migration.status === 'future_schema') {
      if (migration.persistent === true || migration.status === 'blocked') {
        await emit('diagnostic', 'migration_persistent_failure', 'degraded', {
          notifyNative: true,
          details: { errorCode: migration.errorCode || migration.status }
        })
      }
      return finish('degraded')
    }
    if (migration.status === 'partial' || migration.status === 'waiting_for_lease') {
      await emit('progress', 'migration_resume_pending', 'degraded', {
        details: { status: migration.status }
      })
      return finish('degraded')
    }

    await emit('progress', 'sync_started', 'syncing')
    try {
      const syncResult = await operations.sync()
      await emit('progress', 'bootstrap_ready', 'ready')
      return finish('ready', syncResult)
    } catch (error) {
      health = 'partial'
      await emit('diagnostic', 'sync_retry_pending', 'degraded', {
        details: { errorCode: error instanceof Error ? error.message : 'sync_failed' }
      })
      return finish('degraded')
    }
  }

  return {
    run<TSyncResult>(context: RuntimeBootstrapContext, operations: RuntimeBootstrapOperations<TSyncResult>) {
      const existing = inFlight.get(context.coordinatorKey)
      if (existing) return existing as Promise<RuntimeBootstrapResult<TSyncResult>>
      const epoch = epochs.get(context.coordinatorKey) || 0
      const request = execute(context, operations, epoch)
      inFlight.set(context.coordinatorKey, request as Promise<RuntimeBootstrapResult<unknown>>)
      const cleanup = () => {
        if (inFlight.get(context.coordinatorKey) === request) inFlight.delete(context.coordinatorKey)
      }
      void request.then(cleanup, cleanup)
      return request
    },
    invalidate(coordinatorKey: string) {
      epochs.set(coordinatorKey, (epochs.get(coordinatorKey) || 0) + 1)
      inFlight.delete(coordinatorKey)
    },
    getSnapshot() {
      return snapshot
    }
  }
}
