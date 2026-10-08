import { describe, it, expect, vi } from 'vitest'
import { requireDesktopUiCompatibility } from '../../app/services/runtime/desktopUiCompatibility'

describe('desktop UI compatibility', () => {
  it('does not leave an unresponsive main bridge loading forever', async () => {
    vi.useFakeTimers()
    try {
      const result = requireDesktopUiCompatibility(1, {getDesktopUiContract: () => new Promise(() => {})})
      const rejected = expect(result).rejects.toThrow('non risponde')
      await vi.advanceTimersByTimeAsync(5000)
      await rejected
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it('web keeps its existing browser bootstrap', async () => {
    await expect(requireDesktopUiCompatibility(0)).resolves.toBeUndefined()
  })
  it('requires the matching main bridge before bootstrapping the bundled UI', async () => {
    await expect(requireDesktopUiCompatibility(1)).rejects.toThrow('non compatibili')
    await expect(requireDesktopUiCompatibility(1, { getDesktopUiContract: vi.fn(async () => 2) })).rejects.toThrow('non compatibili')
    await expect(requireDesktopUiCompatibility(1, { getDesktopUiContract: vi.fn(async () => 1) })).resolves.toBeUndefined()
    await expect(requireDesktopUiCompatibility(1, { getDesktopUiContract: vi.fn(async () => { throw Error('IPC unavailable') }) })).rejects.toThrow('IPC unavailable')
  })
})
