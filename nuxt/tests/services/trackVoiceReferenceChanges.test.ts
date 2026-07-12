import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  publishTrackVoiceReferencesChanged,
  subscribeTrackVoiceReferencesChanged,
} from '~/services/spotter/trackVoiceReferenceChanges'

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  listener: (() => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()

  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this)
  }

  addEventListener(_type: string, listener: () => void) { this.listener = listener }
  removeEventListener(_type: string, listener: () => void) {
    if (this.listener === listener) this.listener = null
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeBroadcastChannel.instances = []
})

describe('trackVoiceReferenceChanges', () => {
  it('publishes a cross-window invalidation and closes the short-lived channel', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    expect(publishTrackVoiceReferencesChanged()).toBe(true)
    const channel = FakeBroadcastChannel.instances[0]!
    expect(channel.name).toBe('acc-track-voice-references-changed')
    expect(channel.postMessage).toHaveBeenCalledWith({ type: 'voice-points-changed' })
    expect(channel.close).toHaveBeenCalledOnce()
  })

  it('subscribes, notifies and releases the listener', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const onChange = vi.fn()
    const unsubscribe = subscribeTrackVoiceReferencesChanged(onChange)
    const channel = FakeBroadcastChannel.instances[0]!
    channel.listener?.()
    expect(onChange).toHaveBeenCalledOnce()
    unsubscribe()
    expect(channel.listener).toBeNull()
    expect(channel.close).toHaveBeenCalledOnce()
  })

  it('degrades safely when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(publishTrackVoiceReferencesChanged()).toBe(false)
    expect(() => subscribeTrackVoiceReferencesChanged(() => {})()).not.toThrow()
  })
})
