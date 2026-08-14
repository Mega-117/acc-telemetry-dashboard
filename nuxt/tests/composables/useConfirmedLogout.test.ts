import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  createConfirmedLogoutCoordinator,
  LOGOUT_FAILURE_MESSAGE,
} from '~/composables/useConfirmedLogout'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('createConfirmedLogoutCoordinator', () => {
  it('esegue la transizione una sola volta dopo il logout confermato', async () => {
    const logout = vi.fn().mockResolvedValue({ success: true })
    const notifyFailure = vi.fn()
    const onConfirmed = vi.fn()
    const coordinator = createConfirmedLogoutCoordinator({ logout, notifyFailure })

    await expect(coordinator.runConfirmedLogout(onConfirmed)).resolves.toBe(true)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(notifyFailure).not.toHaveBeenCalled()
  })

  it('mantiene la shell protetta e non espone l’errore provider su rigetto esplicito', async () => {
    const logout = vi.fn().mockResolvedValue({
      success: false,
      error: 'token for pilot@example.invalid',
    })
    const notifyFailure = vi.fn()
    const onConfirmed = vi.fn()
    const coordinator = createConfirmedLogoutCoordinator({ logout, notifyFailure })

    await expect(coordinator.runConfirmedLogout(onConfirmed)).resolves.toBe(false)

    expect(onConfirmed).not.toHaveBeenCalled()
    expect(notifyFailure).toHaveBeenCalledOnce()
    expect(notifyFailure).toHaveBeenCalledWith(LOGOUT_FAILURE_MESSAGE)
    expect(LOGOUT_FAILURE_MESSAGE).not.toContain('pilot@example.invalid')
    expect(LOGOUT_FAILURE_MESSAGE).not.toContain('token')
  })

  it('resta fail-closed anche se il provider lancia un’eccezione', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('secret provider detail'))
    const notifyFailure = vi.fn()
    const onConfirmed = vi.fn()
    const coordinator = createConfirmedLogoutCoordinator({ logout, notifyFailure })

    await expect(coordinator.runConfirmedLogout(onConfirmed)).resolves.toBe(false)

    expect(onConfirmed).not.toHaveBeenCalled()
    expect(notifyFailure).toHaveBeenCalledWith(LOGOUT_FAILURE_MESSAGE)
    expect(LOGOUT_FAILURE_MESSAGE).not.toContain('secret provider detail')
  })

  it('ignora un secondo tentativo mentre il primo logout è pendente', async () => {
    let resolveLogout: ((result: { success: true }) => void) | undefined
    const logout = vi.fn(() => new Promise<{ success: true }>((resolve) => {
      resolveLogout = resolve
    }))
    const notifyFailure = vi.fn()
    const firstTransition = vi.fn()
    const secondTransition = vi.fn()
    const coordinator = createConfirmedLogoutCoordinator({ logout, notifyFailure })

    const firstAttempt = coordinator.runConfirmedLogout(firstTransition)
    await expect(coordinator.runConfirmedLogout(secondTransition)).resolves.toBe(false)
    resolveLogout?.({ success: true })
    await expect(firstAttempt).resolves.toBe(true)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(firstTransition).toHaveBeenCalledOnce()
    expect(secondTransition).not.toHaveBeenCalled()
    expect(notifyFailure).not.toHaveBeenCalled()
  })

  it('propaga un errore della transizione dopo un logout già confermato', async () => {
    const transitionError = new Error('navigation failed')
    const notifyFailure = vi.fn()
    const coordinator = createConfirmedLogoutCoordinator({
      logout: vi.fn().mockResolvedValue({ success: true }),
      notifyFailure,
    })

    await expect(coordinator.runConfirmedLogout(() => {
      throw transitionError
    })).rejects.toBe(transitionError)
    expect(notifyFailure).not.toHaveBeenCalled()
  })
})

describe('logout entry-point contract', () => {
  it.each([
    '../../app/app.vue',
    '../../app/layouts/dashboard.vue',
    '../../app/layouts/coach.vue',
    '../../app/pages/profilo.vue',
  ])('%s delega la transizione al coordinatore condiviso', (relativePath) => {
    const entryPoint = source(relativePath)

    expect(entryPoint).toContain('useConfirmedLogout(firebaseLogout)')
    expect(entryPoint).toContain('runConfirmedLogout')
    expect(entryPoint).not.toContain('await firebaseLogout()')
  })
})
