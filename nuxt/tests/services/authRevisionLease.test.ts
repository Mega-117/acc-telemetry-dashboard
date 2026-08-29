import { describe, expect, it } from 'vitest'
import { createAuthRevisionLeaseCoordinator } from '~/services/auth/authRevisionLease'

describe('auth revision lease', () => {
  it('rifiuta un risultato di A dopo logout', () => {
    const coordinator = createAuthRevisionLeaseCoordinator()
    coordinator.observe('uid-a')
    const lease = coordinator.capture('uid-a')!

    coordinator.observe(null)

    expect(coordinator.isLeaseCurrent(lease, null)).toBe(false)
  })

  it('rifiuta un risultato di A dopo il cambio verso B', () => {
    const coordinator = createAuthRevisionLeaseCoordinator()
    coordinator.observe('uid-a')
    const lease = coordinator.capture('uid-a')!

    coordinator.observe('uid-b')

    expect(coordinator.isLeaseCurrent(lease, 'uid-b')).toBe(false)
  })

  it('rifiuta una lease precedente anche dopo A logout e nuovo login A', () => {
    const coordinator = createAuthRevisionLeaseCoordinator()
    coordinator.observe('uid-a')
    const oldLease = coordinator.capture('uid-a')!
    coordinator.observe(null)
    coordinator.observe('uid-a')

    expect(coordinator.isLeaseCurrent(oldLease, 'uid-a')).toBe(false)
    expect(coordinator.isLeaseCurrent(coordinator.capture('uid-a')!, 'uid-a')).toBe(true)
  })
})
