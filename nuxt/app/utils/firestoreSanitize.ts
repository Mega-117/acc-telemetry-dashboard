function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return null as T
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as T
  }

  // Firestore sentinels/Timestamps/refs are class instances. Leave them untouched.
  if (!isPlainObject(value)) return value

  const sanitized: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = sanitizeForFirestore(item)
  }
  return sanitized as T
}
