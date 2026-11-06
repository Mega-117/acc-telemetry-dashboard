/** A failed/deadlined preparation never reveals late partial results. */
export async function preparePage<T>(work: () => Promise<T>, timeoutMs = 12000): Promise<
  { ok: true; value: T } | { ok: false }
> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(work).then(value => ({ ok: true as const, value })),
      new Promise<{ ok: false }>(resolve => { timer = setTimeout(() => resolve({ ok: false }), timeoutMs) }),
    ])
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 06/11 (user: a click, then nothing for half a second): what a page was last prepared with, per page and owner, in
 * memory only. A page seen before enters at once with it (PIP-455: still a whole page, never an empty one) and
 * refreshes behind; the next visit gets the newer one.
 */
const remembered = new Map<string, unknown>()
export function rememberPage<T>(key: string, value: T): void { remembered.set(key, value) }
export function rememberedPage<T>(key: string): T | undefined { return remembered.get(key) as T | undefined }

/** Preserve the chosen fonts; wait for their actual metrics before entering. */
export async function preparePageFonts(): Promise<void> {
  if (typeof document === 'undefined') return
  await Promise.all([
    document.fonts.load('400 16px Inter'),
    document.fonts.load('italic 500 18px "Racer Display"'),
    document.fonts.load('italic 700 24px "Racer Display"'),
  ])
}
