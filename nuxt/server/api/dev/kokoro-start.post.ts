import { closeSync, openSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { readKokoroRuntimeStatus } from '../../utils/kokoroRuntimeStatus'

// Autostart Kokoro (PIP-100): quando il voice lab trova il server offline,
// lo avvia come processo figlio del dev server — niente terminale manuale.
// Il primo avvio carica il modello neurale: il lab mostra lo stato e fa
// polling finche' /voices non risponde.
let starting = false

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const current = await readKokoroRuntimeStatus()
  if (current.state === 'online') return { status: 'online' }
  if (current.state === 'starting') return { status: 'starting', message: current.message }
  if (current.state === 'error') {
    throw createError({ statusCode: 500, statusMessage: `Kokoro avviato ma non pronto: ${current.message || 'errore warmup'}` })
  }
  if (starting) return { status: 'starting' }

  starting = true
  const script = join(process.cwd(), 'scripts', 'kokoro_tts_server.py')
  const outLog = join(process.cwd(), 'kokoro_tts_out.log')
  const errLog = join(process.cwd(), 'kokoro_tts_err.log')
  let stdoutFd: number | undefined
  let stderrFd: number | undefined
  try {
    stdoutFd = openSync(outLog, 'a')
    stderrFd = openSync(errLog, 'a')
    const child = spawn('python', [script], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    })
    child.unref()
    closeSync(stdoutFd)
    closeSync(stderrFd)
    stdoutFd = undefined
    stderrFd = undefined
    child.on('error', () => {
      starting = false
    })
    // Dopo un tempo ragionevole permetti un nuovo tentativo se non e' mai
    // andato online (es. python mancante).
    setTimeout(() => { starting = false }, 120_000)
    return { status: 'starting', logs: { stdout: outLog, stderr: errLog } }
  } catch (error: any) {
    starting = false
    if (stdoutFd !== undefined) closeSync(stdoutFd)
    if (stderrFd !== undefined) closeSync(stderrFd)
    throw createError({ statusCode: 500, statusMessage: `Avvio Kokoro fallito: ${error?.message || 'errore'}` })
  }
})
