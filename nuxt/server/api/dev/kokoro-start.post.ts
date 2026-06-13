import { spawn } from 'node:child_process'
import { join } from 'node:path'

// Autostart Kokoro (PIP-100): quando il voice lab trova il server offline,
// lo avvia come processo figlio del dev server — niente terminale manuale.
// Il primo avvio carica il modello neurale: il lab mostra lo stato e fa
// polling finche' /voices non risponde.
const KOKORO_URL = 'http://localhost:5111'
let starting = false

async function isOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${KOKORO_URL}/voices`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export default defineEventHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  if (await isOnline()) return { status: 'online' }
  if (starting) return { status: 'starting' }

  starting = true
  const script = join(process.cwd(), 'scripts', 'kokoro_tts_server.py')
  try {
    const child = spawn('python', [script], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    child.on('error', () => { starting = false })
    // Dopo un tempo ragionevole permetti un nuovo tentativo se non e' mai
    // andato online (es. python mancante).
    setTimeout(() => { starting = false }, 120_000)
    return { status: 'starting' }
  } catch (error: any) {
    starting = false
    throw createError({ statusCode: 500, statusMessage: `Avvio Kokoro fallito: ${error?.message || 'errore'}` })
  }
})
