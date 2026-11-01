/**
 * PIP-702: why the HUD window stutters. Chromium reports every frame that took 50 ms or more
 * ("long animation frame"), split into script time (with the scripts that ran) and rendering
 * time (style, layout, paint). Vue mounts/updates of each component are timed alongside and
 * attributed to the slow frame as soon as it is reported, before their spans expire.
 *
 * Every 30 s the window sends one summary to the diary (`hud.long_frames`); with nothing to
 * report it still sends one every 5 minutes, so a missing row means "not observing", never
 * "healthy". Reading a summary (every field is evidence, none is proof on its own):
 * - `scriptMs` + `scripts` + `top`: JavaScript that ran in slow frames and the components that
 *   were updating (inclusive times: a parent includes its children; `top` names candidates);
 * - `layoutMs`: style and layout of slow frames (from styleAndLayoutStart);
 * - `renderMs`: the whole rendering phase, which also runs requestAnimationFrame callbacks;
 * - `unattributedMs`: slow-frame time that no script entry and no layout covers (short scripts
 *   below the browser threshold, other work in this window, or waiting).
 * Gaps in `hud.frames` with no slow frame here point outside this window's main thread.
 *
 * Pure logic: the plugin feeds it, nothing here touches the DOM or IPC.
 */
export const HUD_LONG_FRAME_REPORT_MS = 30_000
export const HUD_LONG_FRAME_HEARTBEAT_MS = 5 * 60_000
const UPDATE_MEMORY_MS = 5_000
const MAX_UPDATES = 2_000
const TOP = 4

export type HudLongFrame = {
  start: number
  duration: number
  /** Long animation frames only: time blocked by script, and when rendering began. */
  blockingDuration?: number
  renderStart?: number
  styleAndLayoutStart?: number
  scripts?: Array<{ label: string; duration: number }>
}

export type HudLongFrameReport = {
  frames: number
  maxMs: number
  totalMs: number
  blockingMs: number
  scriptMs: number
  renderMs: number
  layoutMs: number
  unattributedMs: number
  /** Slow-frame time covered by timed component updates (union, never double counted). */
  attributedMs: number
  top: string[]
  scripts: string[]
  /** Observation time of this summary, so rows are comparable. */
  periodMs: number
  /** 'loaf' = long animation frames (breakdown), 'longtask' = fallback without breakdown. */
  source: 'loaf' | 'longtask'
  /** Last summary of the page (page hide): accepted even right after a periodic one. */
  final?: true
}

type Span = { name: string; start: number; end: number }

/** Total length of the union of intervals clipped to [from, to]. */
export function coveredMs(spans: Array<{ start: number; end: number }>, from: number, to: number): number {
  const clipped = spans.map(s => ({ start: Math.max(s.start, from), end: Math.min(s.end, to) }))
    .filter(s => s.end > s.start).sort((a, b) => a.start - b.start)
  let total = 0, cursor = -Infinity
  for (const s of clipped) {
    if (s.end <= cursor) continue
    total += s.end - Math.max(s.start, cursor)
    cursor = s.end
  }
  return total
}

export function createHudLongFrameAggregator(source: 'loaf' | 'longtask', startedAt: number) {
  let updates: Span[] = []
  let prunedAt = -Infinity
  let periodFrom = startedAt
  let lastSentAt = startedAt
  let frames = 0, maxMs = 0, totalMs = 0, blockingMs = 0, scriptMs = 0, renderMs = 0, attributedMs = 0
  let layoutMs = 0, unattributedMs = 0
  const byComponent = new Map<string, number>()
  const byScript = new Map<string, number>()

  // A 20 Hz HUD makes hundreds of updates per second: trim at most once a second or when the
  // buffer doubles, never on every update.
  function prune(now: number) {
    if (updates.length < MAX_UPDATES * 2 && now - prunedAt < 1_000) return
    prunedAt = now
    const from = now - UPDATE_MEMORY_MS
    updates = updates.filter(span => span.end >= from).slice(-MAX_UPDATES)
  }

  function reset(now: number) {
    periodFrom = now
    frames = maxMs = totalMs = blockingMs = scriptMs = renderMs = attributedMs = layoutMs = unattributedMs = 0
    byComponent.clear()
    byScript.clear()
  }

  return {
    /** A component finished mounting or updating (performance.now() times). */
    update(name: string, start: number, end: number) {
      if (!(end >= start) || !Number.isFinite(start)) return
      updates.push({ name, start, end })
      prune(end)
    },
    /** A slow frame from the observer; attributed now, while its component spans still exist. */
    frame(frame: HudLongFrame) {
      const { start, duration } = frame
      if (!(duration > 0) || !Number.isFinite(start)) return
      const end = start + duration
      frames++
      totalMs += duration
      maxMs = Math.max(maxMs, duration)
      const blocking = frame.blockingDuration
      if (typeof blocking === 'number' && Number.isFinite(blocking)) blockingMs += Math.max(0, blocking)
      const renderStart = frame.renderStart
      if (typeof renderStart === 'number' && Number.isFinite(renderStart) && renderStart > start) renderMs += Math.max(0, end - renderStart)
      let frameScriptMs = 0
      for (const script of frame.scripts ?? []) {
        if (!(script.duration > 0)) continue
        frameScriptMs += script.duration
        byScript.set(script.label, (byScript.get(script.label) ?? 0) + script.duration)
      }
      scriptMs += frameScriptMs
      const layoutStart = frame.styleAndLayoutStart
      const frameLayoutMs = typeof layoutStart === 'number' && Number.isFinite(layoutStart) && layoutStart > start
        ? Math.max(0, end - layoutStart) : 0
      layoutMs += frameLayoutMs
      // Only with the long-animation-frame breakdown; a plain long task has no breakdown.
      if (frame.scripts) unattributedMs += Math.max(0, duration - Math.min(duration, frameScriptMs + frameLayoutMs))
      const inside = updates.filter(span => span.end > start && span.start < end)
      attributedMs += coveredMs(inside, start, end)
      for (const span of inside) {
        const overlap = Math.min(span.end, end) - Math.max(span.start, start)
        byComponent.set(span.name, (byComponent.get(span.name) ?? 0) + overlap)
      }
    },
    /** The summary for the period, or null when there is nothing to say yet. */
    take(now: number, final = false): HudLongFrameReport | null {
      const heartbeatDue = now - lastSentAt >= HUD_LONG_FRAME_HEARTBEAT_MS
      if (!frames && !heartbeatDue && !final) return null
      const rank = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP)
        .map(([name, ms]) => `${Math.round(ms)}ms ${name}`)
      const report: HudLongFrameReport = {
        frames, maxMs: Math.round(maxMs), totalMs: Math.round(totalMs), blockingMs: Math.round(blockingMs),
        scriptMs: Math.round(scriptMs), renderMs: Math.round(renderMs), layoutMs: Math.round(layoutMs),
        unattributedMs: Math.round(unattributedMs), attributedMs: Math.round(attributedMs),
        top: rank(byComponent), scripts: rank(byScript), periodMs: Math.round(now - periodFrom), source,
        ...(final && { final: true }),
      }
      lastSentAt = now
      reset(now)
      return report
    },
  }
}

/** Label without paths or user data: letters, digits and a few separators only. */
export function cleanLabel(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : ''
  const clean = text.replace(/[^A-Za-z0-9_.:@-]/g, '').slice(0, 40)
  return clean || 'anonymous'
}

/** Component label: the SFC name only. */
export function componentLabel(options: { __name?: unknown; name?: unknown } | null | undefined): string {
  const raw = typeof options?.__name === 'string' ? options.__name : typeof options?.name === 'string' ? options.name : ''
  // A file-like name keeps only its last part: never a folder (and so never a user name).
  return cleanLabel(raw.split(/[\\/]/).pop())
}

/** Script label of a long-animation-frame script entry: function name, else what invoked it. */
export function scriptLabel(script: { sourceFunctionName?: unknown; invoker?: unknown; invokerType?: unknown }): string {
  const fn = typeof script.sourceFunctionName === 'string' && script.sourceFunctionName ? script.sourceFunctionName : ''
  const invoker = typeof script.invoker === 'string' ? script.invoker : typeof script.invokerType === 'string' ? script.invokerType : ''
  return cleanLabel(fn ? `${fn}@${invoker}`.replace(/@$/, '') : invoker)
}

type LoafScript = { duration?: number; sourceFunctionName?: string; invoker?: string; invokerType?: string }
type LoafEntry = { startTime: number; duration: number; blockingDuration?: number; renderStart?: number; styleAndLayoutStart?: number; scripts?: LoafScript[] }
type ObserverCtor = {
  new (callback: (list: { getEntries(): LoafEntry[] }) => void): { observe(options: { type: string; buffered?: boolean }): void; disconnect(): void; takeRecords(): LoafEntry[] }
  supportedEntryTypes?: readonly string[]
}
type Lifecycle = (this: { $options?: { __name?: unknown; name?: unknown } }) => void

/**
 * Wires the aggregator to the browser (observer, timer, page hide) and Vue (global mixin).
 * Returns false when it cannot observe. Separate from the plugin so tests drive it.
 */
export function installHudLongFrameReporter(env: {
  Observer: ObserverCtor | undefined
  now: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
  onPageHide: (fn: () => void) => void
  mixin: (hooks: { beforeMount: Lifecycle; mounted: Lifecycle; beforeUpdate: Lifecycle; updated: Lifecycle }) => void
  report: (summary: HudLongFrameReport) => unknown
}): boolean {
  const Observer = env.Observer
  if (typeof Observer !== 'function') return false
  const supported = Observer.supportedEntryTypes ?? []
  const source = supported.includes('long-animation-frame') ? 'loaf' : supported.includes('longtask') ? 'longtask' : null
  if (!source) return false
  const aggregator = createHudLongFrameAggregator(source, env.now())
  const started = new WeakMap<object, number>()
  const begin: Lifecycle = function () { started.set(this, env.now()) }
  const finish: Lifecycle = function () {
    const start = started.get(this)
    if (start === undefined) return
    started.delete(this)
    aggregator.update(componentLabel(this.$options), start, env.now())
  }
  env.mixin({ beforeMount: begin, mounted: finish, beforeUpdate: begin, updated: finish })
  const toFrame = (entry: LoafEntry): HudLongFrame => source === 'loaf'
    ? { start: entry.startTime, duration: entry.duration, blockingDuration: entry.blockingDuration, renderStart: entry.renderStart,
        styleAndLayoutStart: entry.styleAndLayoutStart,
        scripts: (entry.scripts ?? []).map(script => ({ label: scriptLabel(script), duration: Number(script.duration) || 0 })) }
    : { start: entry.startTime, duration: entry.duration }
  const observer = new Observer((list) => { for (const entry of list.getEntries()) aggregator.frame(toFrame(entry)) })
  // The entry type, not the short name of the summary (`loaf` is not an entry type).
  observer.observe({ type: source === 'loaf' ? 'long-animation-frame' : 'longtask', buffered: false })
  const send = (final = false) => {
    const summary = aggregator.take(env.now(), final)
    if (summary) void Promise.resolve().then(() => env.report(summary)).catch(() => {})
  }
  const timer = env.setInterval(() => send(), HUD_LONG_FRAME_REPORT_MS)
  env.onPageHide(() => {
    for (const entry of observer.takeRecords()) aggregator.frame(toFrame(entry))
    observer.disconnect()
    env.clearInterval(timer)
    send(true)
  })
  return true
}
