import { closeSync, existsSync, openSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { markManagedChatterboxProcess } from '../../utils/chatterboxProcessRegistry'
import { readChatterboxRuntimeStatus } from '../../utils/chatterboxRuntimeStatus'

let starting = false

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const current = await readChatterboxRuntimeStatus()
  if (current.state === 'online') return { status: 'online', managed: current.managed ?? false }
  if (current.state === 'starting' || starting) return { status: 'starting' }

  starting = true
  const script = join(process.cwd(), 'scripts', 'chatterbox_tts_server.py')
  const outLog = join(process.cwd(), 'chatterbox_tts_out.log')
  const errLog = join(process.cwd(), 'chatterbox_tts_err.log')
  const localPython = join(process.cwd(), '..', 'training_data', 'chatterbox_venv', 'Scripts', 'python.exe')
  const python = process.env.ACC_CHATTERBOX_PYTHON
    || (existsSync(localPython) ? localPython : 'python')

  let stdoutFd: number | undefined
  let stderrFd: number | undefined
  try {
    stdoutFd = openSync(outLog, 'a')
    stderrFd = openSync(errLog, 'a')
    const child = spawn(python, [script], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    })
    child.unref()
    markManagedChatterboxProcess(child)
    closeSync(stdoutFd)
    closeSync(stderrFd)
    stdoutFd = undefined
    stderrFd = undefined
    child.on('error', () => { starting = false })
    child.on('exit', () => { starting = false })
    setTimeout(() => { starting = false }, 300_000)
    return { status: 'starting', managed: true, pid: child.pid, logs: { stdout: outLog, stderr: errLog } }
  } catch (error: any) {
    starting = false
    if (stdoutFd !== undefined) closeSync(stdoutFd)
    if (stderrFd !== undefined) closeSync(stderrFd)
    throw createError({ statusCode: 500, statusMessage: `Avvio Chatterbox fallito: ${error?.message || 'errore'}` })
  }
})
