// A receipt only avoids rechecking derived public documents. It never supplies
// identity, role or permissions: those still come from the fresh owner document.
const KEY = 'racercore.profile-projection-receipt.v1'
export const PROFILE_PROJECTION_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000

export function clearProfileProjectionReceipt() {
  try { globalThis.localStorage?.removeItem(KEY) } catch { /* storage is optional */ }
}

export function hasProfileProjectionReceipt(uid: string, projection: unknown, now = Date.now()): boolean {
  try {
    const receipt = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')
    if (!receipt || receipt.uid !== uid) { clearProfileProjectionReceipt(); return false }
    const age = now - receipt.checkedAt
    return Number.isFinite(age) && age >= 0 && age < PROFILE_PROJECTION_RECEIPT_TTL_MS
      && receipt.projection === JSON.stringify(projection)
  } catch { return false }
}

export function rememberProfileProjectionReceipt(uid: string, projection: unknown, now = Date.now()) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify({ uid, projection: JSON.stringify(projection), checkedAt: now })) }
  catch { /* Repeat the remote check when storage is unavailable. */ }
}
