import { describe, it, expect } from 'vitest'
import { resolveSyncTriggerAction } from '~/services/sync/syncTriggerPolicy'
import type { SyncTrigger } from '~/services/sync/syncTriggerPolicy'

describe('resolveSyncTriggerAction', () => {
  it('filesChanged: scanMode changed, processPending true', () => {
    const action = resolveSyncTriggerAction('filesChanged')
    expect(action.scanMode).toBe('changed')
    expect(action.processPending).toBe(true)
    expect(action.runMaintenance).toBe(false)
    expect(action.interactive).toBe(false)
    expect(action.trigger).toBe('filesChanged')
  })

  it('windowFocused: scanMode none, nessuna operazione', () => {
    const action = resolveSyncTriggerAction('windowFocused')
    expect(action.scanMode).toBe('none')
    expect(action.processPending).toBe(false)
    expect(action.runMaintenance).toBe(false)
    expect(action.interactive).toBe(false)
  })

  it('initialFiles: scanMode none, nessuna operazione', () => {
    const action = resolveSyncTriggerAction('initialFiles')
    expect(action.scanMode).toBe('none')
    expect(action.processPending).toBe(false)
    expect(action.runMaintenance).toBe(false)
  })

  it('authReady: scanMode full, maintenance e processPending attivi', () => {
    const action = resolveSyncTriggerAction('authReady')
    expect(action.scanMode).toBe('full')
    expect(action.processPending).toBe(true)
    expect(action.runMaintenance).toBe(true)
    expect(action.interactive).toBe(false)
  })

  it('manualForceSync: scanMode full, tutti attivi, interactive true', () => {
    const action = resolveSyncTriggerAction('manualForceSync')
    expect(action.scanMode).toBe('full')
    expect(action.processPending).toBe(true)
    expect(action.runMaintenance).toBe(true)
    expect(action.interactive).toBe(true)
  })

  it('ogni trigger restituisce il trigger corretto nel campo trigger', () => {
    const triggers: SyncTrigger[] = [
      'filesChanged',
      'windowFocused',
      'initialFiles',
      'authReady',
      'manualForceSync',
    ]
    for (const t of triggers) {
      expect(resolveSyncTriggerAction(t).trigger).toBe(t)
    }
  })
})
