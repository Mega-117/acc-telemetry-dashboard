export interface AuthRevisionLease {
  revision: number
  uid: string
}

export function createAuthRevisionLeaseCoordinator() {
  let revision = 0
  let observedUid: string | null = null

  function observe(uid: string | null) {
    const previousUid = observedUid
    observedUid = uid
    revision += 1
    return { revision, previousUid, uid }
  }

  function invalidate() {
    revision += 1
    return revision
  }

  function capture(uid: string | null | undefined): AuthRevisionLease | null {
    if (!uid || uid !== observedUid) return null
    return { revision, uid }
  }

  function isRevisionCurrent(candidate: number) {
    return candidate === revision
  }

  function isLeaseCurrent(lease: AuthRevisionLease, currentUid: string | null | undefined) {
    return lease.revision === revision
      && lease.uid === observedUid
      && lease.uid === currentUid
  }

  function getObservedUid() {
    return observedUid
  }

  return {
    observe,
    invalidate,
    capture,
    isRevisionCurrent,
    isLeaseCurrent,
    getObservedUid,
  }
}
