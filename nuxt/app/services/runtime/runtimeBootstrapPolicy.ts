export type RuntimeNetworkState = 'online' | 'offline'
export type RuntimeAuthState = 'ready' | 'pending' | 'unauthenticated'
export type RuntimeHealthState =
  | 'unknown'
  | 'healthy'
  | 'repairing'
  | 'partial'
  | 'blocked'
  | 'future_schema'

export type RuntimeMigrationCompatibility =
  | 'read_compatible'
  | 'write_critical'
  | 'read_write_critical'

export type RuntimeCapabilityState = 'allowed' | 'pending' | 'blocked' | 'not_required'

export interface RuntimeCapability {
  state: RuntimeCapabilityState
  reason: string
}
export interface RuntimeBootstrapCapabilities {
  localRead: RuntimeCapability
  localWrite: RuntimeCapability
  localProcessing: RuntimeCapability
  cloudRead: RuntimeCapability
  cloudWrite: RuntimeCapability
  sync: RuntimeCapability
  migrate: RuntimeCapability
  remoteHealth: RuntimeCapability
}

export interface RuntimeBootstrapPolicyInput {
  network: RuntimeNetworkState
  auth: RuntimeAuthState
  health: RuntimeHealthState
  compatibility?: RuntimeMigrationCompatibility
}

function capability(state: RuntimeCapabilityState, reason: string): RuntimeCapability {
  return { state, reason }
}

function localCapabilities(): Pick<
  RuntimeBootstrapCapabilities,
  'localRead' | 'localWrite' | 'localProcessing'
> {
  return {
    localRead: capability('allowed', 'offline_local_invariant'),
    localWrite: capability('allowed', 'offline_local_invariant'),
    localProcessing: capability('allowed', 'offline_local_invariant')
  }
}

function cloudPending(reason: string): Omit<
  RuntimeBootstrapCapabilities,
  'localRead' | 'localWrite' | 'localProcessing'
> {
  return {
    cloudRead: capability('pending', reason),
    cloudWrite: capability('pending', reason),
    sync: capability('pending', reason),
    migrate: capability('pending', reason),
    remoteHealth: capability('pending', reason)
  }
}

export function resolveRuntimeBootstrapCapabilities(
  input: RuntimeBootstrapPolicyInput
): RuntimeBootstrapCapabilities {
  const local = localCapabilities()
  if (input.network === 'offline') return { ...local, ...cloudPending('offline_cloud_pending') }
  if (input.auth !== 'ready') return { ...local, ...cloudPending('auth_cloud_pending') }

  const readCompatible = input.compatibility === 'read_compatible'
    || input.compatibility === 'write_critical'

  if (input.health === 'healthy') {
    return {
      ...local,
      cloudRead: capability('allowed', 'healthy'),
      cloudWrite: capability('allowed', 'healthy'),
      sync: capability('allowed', 'healthy'),
      migrate: capability('not_required', 'healthy'),
      remoteHealth: capability('allowed', 'healthy')
    }
  }

  if (input.health === 'partial' || input.health === 'repairing' || input.health === 'unknown') {
    const reason = input.health === 'partial'
      ? 'migration_partial_resume'
      : input.health === 'repairing'
        ? 'migration_lease_active'
        : 'health_verification_required'
    return {
      ...local,
      cloudRead: readCompatible
        ? capability('allowed', 'migration_read_compatible')
        : capability('pending', reason),
      cloudWrite: capability('pending', reason),
      sync: capability('pending', reason),
      migrate: capability('allowed', reason),
      remoteHealth: capability('allowed', reason)
    }
  }

  if (input.health === 'future_schema') {
    return {
      ...local,
      cloudRead: readCompatible
        ? capability('allowed', 'trusted_future_read_compatible')
        : capability('blocked', 'future_schema_guard'),
      cloudWrite: capability('blocked', 'future_schema_guard'),
      sync: capability('blocked', 'future_schema_guard'),
      migrate: capability('blocked', 'future_schema_guard'),
      remoteHealth: capability('allowed', 'future_schema_guard')
    }
  }

  return {
    ...local,
    cloudRead: readCompatible
      ? capability('allowed', 'blocked_but_read_compatible')
      : capability('blocked', 'migration_persistent_failure'),
    cloudWrite: capability('blocked', 'migration_persistent_failure'),
    sync: capability('blocked', 'migration_persistent_failure'),
    migrate: capability('blocked', 'migration_persistent_failure'),
    remoteHealth: capability('allowed', 'migration_persistent_failure')
  }
}
