type KokoroState = 'online' | 'starting' | 'offline' | 'error'

interface DesktopSpeakResponse {
  ok: boolean
  dataBase64?: string
  mime?: string
  bytes?: number
  error?: string
}

const LOCAL_VOICE_LAB_BRIDGE = 'http://127.0.0.1:5112'
const LOCAL_PROGRAM_UNAVAILABLE = 'Programma locale ACC Suite non raggiungibile. Avvia il launcher locale e riprova.'

function getElectronApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

function base64ToBlob(dataBase64: string, mime = 'audio/wav') {
  const binary = atob(dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function localBridgeJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${LOCAL_VOICE_LAB_BRIDGE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(65_000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}

function localProgramError(error: any) {
  return new Error(error?.message || LOCAL_PROGRAM_UNAVAILABLE)
}

export function useVoiceLabRuntime() {
  function desktopApi() {
    const api = getElectronApi()
    return api?.kokoroReady && api?.kokoroStart && api?.kokoroSpeak ? api : null
  }

  function hasDesktopRuntime() {
    return Boolean(desktopApi())
  }

  async function kokoroReady(): Promise<{ state: KokoroState; message?: string; voices?: any[] }> {
    const api = desktopApi()
    if (api) return await api.kokoroReady()
    try {
      return await localBridgeJson('/kokoro-ready')
    } catch (error: any) {
      return { state: 'offline', message: error?.message || LOCAL_PROGRAM_UNAVAILABLE }
    }
  }

  async function kokoroStart() {
    const api = desktopApi()
    if (api) return await api.kokoroStart()
    try {
      return await localBridgeJson('/kokoro-start', { method: 'POST' })
    } catch (error) {
      throw localProgramError(error)
    }
  }

  async function kokoroStop() {
    const api = desktopApi()
    if (api?.kokoroStop) return await api.kokoroStop()
    try {
      return await localBridgeJson('/kokoro-stop', { method: 'POST' })
    } catch (error) {
      throw localProgramError(error)
    }
  }

  async function synthesize(text: string, voice: string, speed: number): Promise<Blob> {
    const api = desktopApi()
    if (api) {
      const response: DesktopSpeakResponse = await api.kokoroSpeak({ text, voice, speed })
      if (!response?.ok || !response.dataBase64) throw new Error(response?.error || 'Sintesi Kokoro fallita')
      return base64ToBlob(response.dataBase64, response.mime || 'audio/wav')
    }

    try {
      const response = await localBridgeJson<DesktopSpeakResponse>('/kokoro-speak', {
        method: 'POST',
        body: JSON.stringify({ text, voice, speed }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response?.ok || !response.dataBase64) throw new Error(response?.error || 'Sintesi Kokoro fallita')
      return base64ToBlob(response.dataBase64, response.mime || 'audio/wav')
    } catch (error) {
      throw localProgramError(error)
    }
  }

  function kokoroSpeakUrl(_text?: string, _voice?: string, _speed?: number) {
    return ''
  }

  async function saveReferenceWav(payload: { track: string; filename: string; dataBase64: string }): Promise<{ path: string }> {
    const api = desktopApi()
    if (api?.voiceLabSaveReferenceWav) {
      const result = await api.voiceLabSaveReferenceWav(payload)
      if (!result?.ok || !result.path) throw new Error(result?.error || 'Salvataggio WAV fallito')
      return { path: result.path }
    }
    try {
      const result = await localBridgeJson<any>('/voice-lab/save-reference-wav', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!result?.ok || !result.path) throw new Error(result?.error || 'Salvataggio WAV fallito')
      return { path: result.path }
    } catch (error) {
      throw localProgramError(error)
    }
  }

  async function readVoicePoints<T>(): Promise<T> {
    const api = desktopApi()
    if (api?.voiceLabReadVoicePoints) return await api.voiceLabReadVoicePoints()
    try {
      return await localBridgeJson<T>('/voice-lab/voice-points')
    } catch (error) {
      throw localProgramError(error)
    }
  }

  async function writeVoicePoints(payload: { points: any[] }) {
    const api = desktopApi()
    if (api?.voiceLabWriteVoicePoints) {
      const result = await api.voiceLabWriteVoicePoints(payload)
      if (!result?.ok) throw new Error(result?.error || 'Salvataggio riferimenti fallito')
      return result
    }
    try {
      const result = await localBridgeJson<any>('/voice-lab/voice-points', {
        method: 'POST',
        body: JSON.stringify(payload),
        keepalive: true,
      })
      if (!result?.ok) throw new Error(result?.error || 'Salvataggio riferimenti fallito')
      return result
    } catch (error) {
      throw localProgramError(error)
    }
  }

  return {
    hasDesktopRuntime,
    kokoroReady,
    kokoroStart,
    kokoroStop,
    kokoroSpeakUrl,
    readVoicePoints,
    saveReferenceWav,
    synthesize,
    writeVoicePoints,
  }
}
