import { describe, expect, it } from 'vitest'
import { resolveRuntimeBootstrapCapabilities } from '~/services/runtime/runtimeBootstrapPolicy'

describe('runtimeBootstrapPolicy', () => {
  it.each(['healthy', 'partial', 'blocked', 'future_schema'] as const)(
    'mantiene tutte le capability locali operative offline con health %s',
    (health) => {
      const result = resolveRuntimeBootstrapCapabilities({ network: 'offline', auth: 'pending', health })
      expect(result.localRead.state).toBe('allowed')
      expect(result.localWrite.state).toBe('allowed')
      expect(result.localProcessing.state).toBe('allowed')
      expect(result.cloudRead.state).toBe('pending')
      expect(result.sync.state).toBe('pending')
    }
  )

  it('consente tutte le capability cloud quando healthy e online', () => {
    const result = resolveRuntimeBootstrapCapabilities({ network: 'online', auth: 'ready', health: 'healthy' })
    expect(result.cloudRead.state).toBe('allowed')
    expect(result.cloudWrite.state).toBe('allowed')
    expect(result.sync.state).toBe('allowed')
    expect(result.migrate.state).toBe('not_required')
  })

  it('mantiene V5 read-compatible ma sospende write e sync durante repair', () => {
    const result = resolveRuntimeBootstrapCapabilities({
      network: 'online', auth: 'ready', health: 'partial', compatibility: 'write_critical'
    })
    expect(result.cloudRead).toEqual({ state: 'allowed', reason: 'migration_read_compatible' })
    expect(result.cloudWrite.state).toBe('pending')
    expect(result.sync.state).toBe('pending')
    expect(result.migrate.state).toBe('allowed')
  })

  it('applica guardia deny-wins allo schema futuro senza compatibilita trusted', () => {
    const result = resolveRuntimeBootstrapCapabilities({
      network: 'online', auth: 'ready', health: 'future_schema', compatibility: 'read_write_critical'
    })
    expect(result.cloudRead.state).toBe('blocked')
    expect(result.cloudWrite.state).toBe('blocked')
    expect(result.localWrite.state).toBe('allowed')
  })

  it('consente offline soltanto la lettura cached con compatibilita trusted valida', () => {
    const trusted = resolveRuntimeBootstrapCapabilities({
      network: 'offline',
      auth: 'ready',
      health: 'partial',
      compatibility: {
        mode: 'write_critical', trusted: true, offlineCachedRead: true
      }
    })
    const untrusted = resolveRuntimeBootstrapCapabilities({
      network: 'offline',
      auth: 'ready',
      health: 'partial',
      compatibility: {
        mode: 'write_critical', trusted: false, offlineCachedRead: true
      }
    })
    expect(trusted.cloudRead.state).toBe('allowed')
    expect(trusted.cloudWrite.state).toBe('pending')
    expect(trusted.sync.state).toBe('pending')
    expect(trusted.migrate.state).toBe('pending')
    expect(trusted.remoteHealth.state).toBe('pending')
    expect(untrusted.cloudRead.state).toBe('pending')
  })

  it('lascia il normale sync ai partial recuperabili da nuovi raw', () => {
    const result = resolveRuntimeBootstrapCapabilities({
      network: 'online',
      auth: 'ready',
      health: 'partial',
      compatibility: {
        mode: 'write_critical',
        trusted: true,
        issues: ['incomplete_cloud_only', 'raw_data_unavailable']
      }
    })
    expect(result.cloudRead.state).toBe('allowed')
    expect(result.cloudWrite).toEqual({ state: 'allowed', reason: 'partial_recovery_upload_safe' })
    expect(result.sync).toEqual({ state: 'allowed', reason: 'partial_recovery_sync_safe' })
    expect(result.migrate.state).toBe('allowed')
  })

  it('attende il lease concorrente e blocca le mutazioni partial sconosciute', () => {
    const result = resolveRuntimeBootstrapCapabilities({
      network: 'online',
      auth: 'ready',
      health: 'repairing',
      compatibility: {
        mode: 'write_critical', trusted: true, activity: 'other_lease'
      }
    })
    expect(result.cloudRead.state).toBe('allowed')
    expect(result.cloudWrite.state).toBe('pending')
    expect(result.sync.state).toBe('pending')
    expect(result.migrate).toEqual({ state: 'pending', reason: 'migration_lease_active' })
  })
})
