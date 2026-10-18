export type EntryPhase = 'cache' | 'overview' | 'route' | 'complete'
export type EntryState = {
  status: 'idle' | 'loading' | 'retrying' | 'failed' | 'ready'
  phase: EntryPhase
  attempt: number
  reason: 'none' | 'timeout' | 'operation-failed'
}
export type EntryAttempt = {
  isCurrent: () => boolean
  step: (phase: EntryPhase, operation: () => Promise<unknown>) => Promise<void>
}
export const EMPTY_ENTRY_STATE: EntryState = { status: 'idle', phase: 'cache', attempt: 0, reason: 'none' }

/** One bounded retry, with cancellation on account change/unmount. No auth side effects. */
export function createDashboardEntryRecovery(options: {
  onChange: (state: EntryState) => void
  timeoutMs?: number
}) {
  let active: { abort: AbortController; promise: Promise<void> } | null = null
  const publish = (value: EntryState) => options.onChange({ ...value })
  function cancel() {
    active?.abort.abort()
    active = null
    publish(EMPTY_ENTRY_STATE)
  }
  function run(work: (attempt: EntryAttempt) => Promise<void>, isOwnerCurrent: () => boolean): Promise<void> {
    if (active) return active.promise
    const abort = new AbortController()
    const isCurrent = () => !abort.signal.aborted && isOwnerCurrent()
    const job = { abort, promise: Promise.resolve() }
    active = job
    job.promise = Promise.resolve().then(async () => {
      for (let attempt = 1; attempt <= 2 && isCurrent(); attempt++) {
        let phase: EntryPhase = 'cache'
        let attemptOpen = true
        const ownsAttempt = () => attemptOpen && isCurrent()
        try {
          await work({ isCurrent: ownsAttempt, step: async (next, operation) => {
            if (!ownsAttempt()) throw new Error('cancelled')
            phase = next
            publish({ status: 'loading', phase, attempt, reason: 'none' })
            await new Promise<void>((resolve, reject) => {
              const finish = (error?: Error) => {
                clearTimeout(timer)
                abort.signal.removeEventListener('abort', cancelled)
                error ? reject(error) : resolve()
              }
              const cancelled = () => finish(new Error('cancelled'))
              const timer = setTimeout(() => finish(new Error('timeout')), options.timeoutMs ?? 15000)
              abort.signal.addEventListener('abort', cancelled, { once: true })
              Promise.resolve().then(() => {
                if (!ownsAttempt()) throw new Error('cancelled')
                return operation()
              }).then(() => finish(), () => finish(new Error('operation-failed')))
            })
            if (!ownsAttempt()) throw new Error('cancelled')
          } })
          if (ownsAttempt()) publish({ status: 'ready', phase: 'complete', attempt, reason: 'none' })
          return
        } catch (error) {
          if (!isCurrent()) return
          publish({ status: attempt === 1 ? 'retrying' : 'failed', phase, attempt,
            reason: error instanceof Error && error.message === 'timeout' ? 'timeout' : 'operation-failed' })
        } finally {
          attemptOpen = false
        }
      }
    }).finally(() => { if (active === job) active = null })
    return job.promise
  }
  return { run, cancel }
}
