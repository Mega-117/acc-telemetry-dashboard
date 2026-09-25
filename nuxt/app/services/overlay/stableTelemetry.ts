import { computed, type ComputedRef } from 'vue'
import { usePresentationVisibility } from '~/composables/usePresentationVisibility'

/** Preserve unchanged JSON branches, without rounding away telemetry or alarms. */
export function retainUnchanged<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object'
    || Array.isArray(previous) !== Array.isArray(next)) return next
  const before = previous as Record<string, unknown>
  const after = next as Record<string, unknown>
  const keys = Object.keys(after)
  let same = keys.length === Object.keys(before).length
  const result = (Array.isArray(next) ? [] : {}) as unknown as Record<string, unknown>
  for (const key of keys) {
    result[key] = retainUnchanged(before[key], after[key])
    if (!Object.hasOwn(before, key) || result[key] !== before[key]) same = false
  }
  return same ? previous : result as T
}

/** Child components are notified only when their actual presentation changes. */
export function stableComputed<T>(read: () => T): ComputedRef<T> {
  const visible = usePresentationVisibility()
  return computed<T>((previous) => !visible.value && previous !== undefined
    ? previous : retainUnchanged(previous as T, read()))
}
