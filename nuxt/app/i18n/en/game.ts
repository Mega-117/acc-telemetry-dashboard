import type { PartialDictionary } from '../types'

export default {
  game: {
    unknown: 'Unknown game',
    syntheticDev: 'Test simulator · DEV',
    connected: 'Connected: {game}',
    started: '{game} running',
    choose: 'Choose the game',
    none: 'No game connected',
    selectorAria: 'Game shown: {game}. Change game',
    experimental: 'Experimental',
    loading: 'Loading',
    selected: 'Game selected',
    source: {
      aria: 'Recording source',
      title: 'Which game do you want to record?',
      body: 'ACC and EVO are both open. The game shown in your history stays the same.',
      changed: 'What is available has changed. Try again with the games shown.',
      failed: 'Choice not saved. Try again.',
    },
    titlebar: {
      refreshing: 'Refreshing...',
      refresh: 'Refresh page',
      syncing: 'Syncing...',
      syncAria: 'Start cloud sync',
      syncUnavailable: 'Sync not available: {reason}',
      minimize: 'Minimize',
      maximize: 'Maximize',
      hide: 'Hide to tray (sync keeps running)',
    },
    sync: {
      nothing: 'No files to sync',
      errors: '{count} errors while syncing',
      createdUpdated: '{created} new, {updated} updated',
      created: '{count} sessions synced',
      updated: '{count} sessions updated',
      skipped: '{count} files skipped (already synced or from other users)',
      done: 'Sync complete',
    },
    maintenance: {
      failed: 'Data check not completed',
      title: 'Data update',
      running: 'Working...',
      close: 'Close notification',
      retry: 'Retry',
    },
  },
} satisfies PartialDictionary
