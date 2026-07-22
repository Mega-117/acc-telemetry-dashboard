import type { ChildProcess } from 'node:child_process'

let managedChild: ChildProcess | null = null
let managedPid: number | null = null

export function markManagedChatterboxProcess(child: ChildProcess) {
  managedChild = child
  managedPid = child.pid ?? null
  child.once('exit', () => {
    if (managedChild === child) {
      managedChild = null
      managedPid = null
    }
  })
}

export function getManagedChatterboxPid() {
  return managedPid
}

export function clearManagedChatterboxProcess() {
  managedChild = null
  managedPid = null
}

export function stopManagedChatterboxProcess() {
  const pid = managedPid
  if (!pid) return { status: 'not-managed' as const }
  try {
    if (managedChild && !managedChild.killed) managedChild.kill()
    else process.kill(pid)
    clearManagedChatterboxProcess()
    return { status: 'stopped' as const, pid }
  } catch (error: any) {
    clearManagedChatterboxProcess()
    if (error?.code === 'ESRCH') return { status: 'already-stopped' as const, pid }
    throw error
  }
}
