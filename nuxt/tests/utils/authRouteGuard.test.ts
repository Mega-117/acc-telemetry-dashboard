import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  getAdminRouteRedirect,
  waitForAuthSettled,
} from '~/utils/authRouteGuard'

describe('getAdminRouteRedirect', () => {
  it('permette l’accesso soltanto a un admin autenticato', () => {
    expect(getAdminRouteRedirect({
      isAuthenticated: true,
      isAdmin: true,
    })).toBeNull()
  })

  it('rimanda piloti e coach alla panoramica', () => {
    expect(getAdminRouteRedirect({
      isAuthenticated: true,
      isAdmin: false,
    })).toBe('/panoramica')
  })

  it('rimanda un utente non autenticato al login', () => {
    expect(getAdminRouteRedirect({
      isAuthenticated: false,
      isAdmin: false,
    })).toBe('/')
  })
})

describe('waitForAuthSettled', () => {
  it('prosegue immediatamente se Firebase ha già risolto la sessione', async () => {
    await expect(waitForAuthSettled(ref(false))).resolves.toBeUndefined()
  })

  it('attende che Firebase abbia risolto la sessione', async () => {
    const isLoading = ref(true)
    let completed = false
    const pending = waitForAuthSettled(isLoading, 1000).then(() => {
      completed = true
    })

    await Promise.resolve()
    expect(completed).toBe(false)

    isLoading.value = false
    await pending
    expect(completed).toBe(true)
  })

  it('degrada dopo il timeout se Firebase non risponde', async () => {
    vi.useFakeTimers()
    const pending = waitForAuthSettled(ref(true), 50)

    await vi.advanceTimersByTimeAsync(50)
    await expect(pending).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
