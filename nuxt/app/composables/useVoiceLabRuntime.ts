type KokoroState = 'online' | 'starting' | 'offline' | 'error'

interface DesktopSpeakResponse {
  ok: boolean
  dataBase64?: string
  mime?: string
  bytes?: number
  error?: string
}

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
    return await $fetch<any>('/api/dev/kokoro-ready' as string, { signal: AbortSignal.timeout(65_000) })
  }

  async function kokoroStart() {
    const api = desktopApi()
    if (api) return await api.kokoroStart()
    return await $fetch<any>('/api/dev/kokoro-start' as string, { method: 'POST' })
  }

  async function kokoroStop() {
    const api = desktopApi()
    if (api?.kokoroStop) return await api.kokoroStop()
    return await $fetch<any>('/api/dev/kokoro-stop' as string, { method: 'POST' })
  }

  async function synthesize(text: string, voice: string, speed: number): Promise<Blob> {
    const api = desktopApi()
    if (api) {
      const response: DesktopSpeakResponse = await api.kokoroSpeak({ text, voice, speed })
      if (!response?.ok || !response.dataBase64) throw new Error(response?.error || 'Sintesi Kokoro fallita')
      return base64ToBlob(response.dataBase64, response.mime || 'audio/wav')
    }

    const url = `/api/dev/kokoro-speak?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${encodeURIComponent(String(speed))}`
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return new Blob([await response.arrayBuffer()], { type: 'audio/wav' })
  }

  function kokoroSpeakUrl(text: string, voice: string, speed: number) {
    const api = desktopApi()
    if (api) return ''
    return `/api/dev/kokoro-speak?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${encodeURIComponent(String(speed))}`
  }

  async function saveReferenceWav(payload: { track: string; filename: string; dataBase64: string }): Promise<{ path: string }> {
    const api = desktopApi()
    if (api?.voiceLabSaveReferenceWav) {
      const result = await api.voiceLabSaveReferenceWav(payload)
      if (!result?.ok || !result.path) throw new Error(result?.error || 'Salvataggio WAV fallito')
      return { path: result.path }
    }
    return await $fetch<any>('/api/dev/voice-reference-wav' as string, { method: 'POST', body: payload })
  }

  async function readVoicePoints<T>(): Promise<T> {
    const api = desktopApi()
    if (api?.voiceLabReadVoicePoints) return await api.voiceLabReadVoicePoints()
    return await $fetch<any>('/api/track-voice-points' as string) as T
  }

  async function writeVoicePoints(payload: { points: any[] }) {
    const api = desktopApi()
    if (api?.voiceLabWriteVoicePoints) {
      const result = await api.voiceLabWriteVoicePoints(payload)
      if (!result?.ok) throw new Error(result?.error || 'Salvataggio riferimenti fallito')
      return result
    }
    return await $fetch<any>('/api/dev/track-voice-points' as string, { method: 'POST', body: payload })
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
