export interface ChatterboxProsody {
  exaggeration: number
  cfgWeight: number
}

export interface ChatterboxProsodyPreset extends ChatterboxProsody {
  id: 'natural' | 'calm' | 'energetic' | 'dramatic'
  label: string
  description: string
}

export const CHATTERBOX_PROSODY_MIN = 0
export const CHATTERBOX_PROSODY_MAX = 1

export const CHATTERBOX_PROSODY_PRESETS: readonly ChatterboxProsodyPreset[] = [
  { id: 'natural', label: 'Naturale', description: 'Equilibrata e fedele al campione.', exaggeration: 0.5, cfgWeight: 0.5 },
  { id: 'calm', label: 'Calma', description: 'Più controllata e regolare.', exaggeration: 0.35, cfgWeight: 0.6 },
  { id: 'energetic', label: 'Energica', description: 'Più viva e incisiva.', exaggeration: 0.7, cfgWeight: 0.3 },
  { id: 'dramatic', label: 'Drammatica', description: 'Espressività marcata e libera.', exaggeration: 0.85, cfgWeight: 0.25 },
]

export const CHATTERBOX_DEFAULT_PROSODY = CHATTERBOX_PROSODY_PRESETS[0]!

function isProsodyValue(value: number) {
  return Number.isFinite(value) && value >= CHATTERBOX_PROSODY_MIN && value <= CHATTERBOX_PROSODY_MAX
}

export function resolveChatterboxProsody(input: unknown): ChatterboxProsody | null {
  const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const exaggeration = Number(payload.exaggeration ?? CHATTERBOX_DEFAULT_PROSODY.exaggeration)
  const cfgWeight = Number(payload.cfgWeight ?? CHATTERBOX_DEFAULT_PROSODY.cfgWeight)
  if (!isProsodyValue(exaggeration) || !isProsodyValue(cfgWeight)) return null
  return { exaggeration, cfgWeight }
}
