// @vitest-environment jsdom
// PIP-632: tracce d'uso verso il programma, mai un errore verso la pagina.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteFeatureUse } from '~/services/usage/featureUseNote'

const win = window as Window & { electronAPI?: unknown }

describe('noteFeatureUse', () => {
  afterEach(() => { delete win.electronAPI })

  it('passes the note to the program', () => {
    const noteFeatureUseBridge = vi.fn()
    win.electronAPI = { noteFeatureUse: noteFeatureUseBridge }
    noteFeatureUse({ event: 'telemetry.opened', laps: 7 })
    expect(noteFeatureUseBridge).toHaveBeenCalledWith({ event: 'telemetry.opened', laps: 7 })
  })

  it('does nothing in the browser or with an old program, and never throws', () => {
    expect(() => noteFeatureUse({ event: 'stats.opened', sessions: 1 })).not.toThrow()
    win.electronAPI = {}
    expect(() => noteFeatureUse({ event: 'stats.opened', sessions: 1 })).not.toThrow()
    win.electronAPI = { noteFeatureUse: () => { throw new Error('ipc') } }
    expect(() => noteFeatureUse({ event: 'laps.share_pasted', laps: 1 })).not.toThrow()
  })
})
