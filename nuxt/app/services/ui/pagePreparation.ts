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

/** Preserve the chosen fonts; wait for their actual metrics before entering. */
export async function preparePageFonts(): Promise<void> {
  if (typeof document === 'undefined') return
  await Promise.all([
    document.fonts.load('400 16px Inter'),
    document.fonts.load('italic 500 18px "Racer Display"'),
    document.fonts.load('italic 700 24px "Racer Display"'),
  ])
}
