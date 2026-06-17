import type { ChildProcess } from 'node:child_process'

let managedChild: ChildProcess | null = null
let managedPid: number | null = null

export function markManagedKokoroProcess(child: ChildProcess) {
  managedChild = child
  managedPid = child.pid ?? null
  child.once('exit', () => {
    if (managedChild === child) {
      managedChild = null
      managedPid = null
    }
  })
}

export function getManagedKokoroPid() {
  return managedPid
}

export function clearManagedKokoroProcess() {
  managedChild = null
  managedPid = null
}

export function stopManagedKokoroProcess() {
  const pid = managedPid
  if (!pid) return { status: 'not-managed' as const }

  try {
    if (managedChild && !managedChild.killed) {
      managedChild.kill()
    } else {
      process.kill(pid)
    }
    clearManagedKokoroProcess()
    return { status: 'stopped' as const, pid }
  } catch (error: any) {
    clearManagedKokoroProcess()
    if (error?.code === 'ESRCH') return { status: 'already-stopped' as const, pid }
    throw error
  }
}
