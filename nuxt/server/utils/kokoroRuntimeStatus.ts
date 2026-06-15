const KOKORO_URL = 'http://localhost:5111'

export type KokoroState = 'online' | 'starting' | 'offline' | 'error'

export interface KokoroRuntimeStatus {
  state: KokoroState
  message?: string
  voices?: unknown[]
}

async function loadKokoroVoices(): Promise<unknown[]> {
  const res = await fetch(`${KOKORO_URL}/voices`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json().catch(() => null)
  return Array.isArray(data?.voices) ? data.voices : []
}

async function warmupLegacyServer(): Promise<KokoroRuntimeStatus> {
  try {
    const url = `${KOKORO_URL}/speak?text=prova.&voice=if_sara&speed=1`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || !contentType.includes('audio/wav')) {
      return { state: 'error', message: `Server Kokoro legacy non pronto: HTTP ${res.status}` }
    }
    return {
      state: 'online',
      message: 'Server Kokoro legacy online: sintesi verificata.',
      voices: await loadKokoroVoices(),
    }
  } catch (error: any) {
    return { state: 'error', message: `Server Kokoro legacy non pronto: ${error?.message || 'errore sintesi'}` }
  }
}

export async function readKokoroRuntimeStatus(): Promise<KokoroRuntimeStatus> {
  try {
    const res = await fetch(`${KOKORO_URL}/ready`, { signal: AbortSignal.timeout(2000) })
    const data = await res.json().catch(() => null)
    const message = data?.readiness?.error || data?.readiness?.message || data?.error
    if (res.ok) {
      return {
        state: 'online',
        message,
        voices: Array.isArray(data?.voices) ? data.voices : await loadKokoroVoices(),
      }
    }
    if (res.status === 503) return { state: 'starting', message }
    if (res.status === 404) return await warmupLegacyServer()
    return { state: 'error', message: message || `HTTP ${res.status}` }
  } catch (error: any) {
    return { state: 'offline', message: error?.message }
  }
}
