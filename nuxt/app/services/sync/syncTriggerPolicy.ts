export type SyncTrigger =
  | 'filesChanged'
  | 'windowFocused'
  | 'initialFiles'
  | 'authReady'
  | 'manualForceSync'

export interface SyncTriggerAction {
  trigger: SyncTrigger
  scanMode: 'full' | 'changed'
  processPending: boolean
  runMaintenance: boolean
  interactive: boolean
}

export function resolveSyncTriggerAction(trigger: SyncTrigger): SyncTriggerAction {
  switch (trigger) {
    case 'filesChanged':
      return {
        trigger,
        scanMode: 'changed',
        processPending: true,
        runMaintenance: false,
        interactive: false
      }
    case 'windowFocused':
      return {
        trigger,
        scanMode: 'full',
        processPending: true,
        runMaintenance: false,
        interactive: false
      }
    case 'initialFiles':
      return {
        trigger,
        scanMode: 'full',
        processPending: true,
        runMaintenance: false,
        interactive: false
      }
    case 'authReady':
      return {
        trigger,
        scanMode: 'full',
        processPending: true,
        runMaintenance: true,
        interactive: false
      }
    case 'manualForceSync':
      return {
        trigger,
        scanMode: 'full',
        processPending: true,
        runMaintenance: true,
        interactive: true
      }
  }
}
