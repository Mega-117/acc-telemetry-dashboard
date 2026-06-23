// Annuncio tempi giro (PIP-155):
// - primario: frase intera pre-generata, zero TTS live mentre si guida;
// - fallback: vecchi mattoncini PIP-101, se il WAV intero manca o il tempo
//   e' fuori dal range pre-generato.

export const TIME_BRICK_DIR = '/voice/qualifying'
export const LAP_TIME_AUDIO_DIR = '/voice/qualifying'
export const LAP_TIME_AUDIO_MIN_TENTHS = 800 // 1:20.0
export const LAP_TIME_AUDIO_MAX_TENTHS = 1509 // 2:30.9
export const LAP_TIME_AUDIO_DEFAULT_SPEED = 1.2
export const LAP_TIME_AUDIO_VOICES = ['if_sara', 'im_nicola'] as const

export type LapTimeAudioVoice = typeof LAP_TIME_AUDIO_VOICES[number]

export interface LapTimeVoiceEntry {
  key: string
  tenths: number
  text: string
  path: string
  filename: string
  voice: LapTimeAudioVoice
  speed: number
}

const UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove']
const TEENS = [
  'dieci',
  'undici',
  'dodici',
  'tredici',
  'quattordici',
  'quindici',
  'sedici',
  'diciassette',
  'diciotto',
  'diciannove',
]
const TENS: Record<number, string> = {
  2: 'venti',
  3: 'trenta',
  4: 'quaranta',
  5: 'cinquanta',
}

export function isLapTimeAudioVoice(voice: string): voice is LapTimeAudioVoice {
  return (LAP_TIME_AUDIO_VOICES as readonly string[]).includes(voice)
}

export function timeBrickPath(brickId: string, voice: string): string {
  return `${TIME_BRICK_DIR}/time-${brickId}-${voice}.wav`
}

export function lapTimeTenthsFromMs(timeMs: number | null): number | null {
  if (!timeMs || timeMs <= 0 || !Number.isFinite(timeMs)) return null
  return Math.floor(timeMs / 100)
}

export function isLapTimeVoiceTenthsInRange(tenths: number): boolean {
  return Number.isInteger(tenths)
    && tenths >= LAP_TIME_AUDIO_MIN_TENTHS
    && tenths <= LAP_TIME_AUDIO_MAX_TENTHS
}

export function lapTimeVoiceKey(tenths: number): string {
  return `lap-time-${tenths.toString().padStart(4, '0')}`
}

export function lapTimeVoiceFilename(tenths: number, voice: LapTimeAudioVoice): string {
  return `${lapTimeVoiceKey(tenths)}-${voice}.wav`
}

export function lapTimeVoicePath(tenths: number, voice: LapTimeAudioVoice): string {
  return `${LAP_TIME_AUDIO_DIR}/${lapTimeVoiceFilename(tenths, voice)}`
}

export function italianNumber0To59(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 59) throw new Error(`Numero fuori range: ${n}`)
  if (n < 10) return UNITS[n]!
  if (n < 20) return TEENS[n - 10]!
  const tensWord = TENS[Math.floor(n / 10)]
  if (!tensWord) throw new Error(`Decina non supportata: ${n}`)
  const unit = n % 10
  if (unit === 0) return tensWord
  if (unit === 1 || unit === 8) return `${tensWord.slice(0, -1)}${UNITS[unit]}`
  return `${tensWord}${UNITS[unit]}`
}

export function lapTimeVoiceText(tenths: number): string {
  if (!isLapTimeVoiceTenthsInRange(tenths)) {
    throw new Error(`Tempo fuori range audio: ${tenths}`)
  }
  const totalSeconds = Math.floor(tenths / 10)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenth = tenths % 10
  const minuteText = italianNumber0To59(minutes)
  const secondText = seconds < 10
    ? `zero ${italianNumber0To59(seconds)}`
    : italianNumber0To59(seconds)
  return `${minuteText}, ${secondText}, punto ${italianNumber0To59(tenth)}.`
}

export function buildLapTimeVoiceEntry(
  tenths: number,
  voice: LapTimeAudioVoice,
  speed = LAP_TIME_AUDIO_DEFAULT_SPEED,
): LapTimeVoiceEntry {
  return {
    key: lapTimeVoiceKey(tenths),
    tenths,
    text: lapTimeVoiceText(tenths),
    path: lapTimeVoicePath(tenths, voice),
    filename: lapTimeVoiceFilename(tenths, voice),
    voice,
    speed,
  }
}

export function buildLapTimeVoiceCatalog(
  voice: LapTimeAudioVoice,
  fromTenths = LAP_TIME_AUDIO_MIN_TENTHS,
  toTenths = LAP_TIME_AUDIO_MAX_TENTHS,
): LapTimeVoiceEntry[] {
  const start = Math.max(LAP_TIME_AUDIO_MIN_TENTHS, Math.floor(fromTenths))
  const end = Math.min(LAP_TIME_AUDIO_MAX_TENTHS, Math.floor(toTenths))
  if (start > end) return []
  const entries: LapTimeVoiceEntry[] = []
  for (let tenths = start; tenths <= end; tenths += 1) {
    entries.push(buildLapTimeVoiceEntry(tenths, voice))
  }
  return entries
}

export function resolveLapTimeVoiceEntry(
  timeMs: number | null,
  valid: boolean,
  voice: LapTimeAudioVoice,
): LapTimeVoiceEntry | null {
  if (!valid) {
    return {
      key: 'lap-invalid',
      tenths: 0,
      text: 'Giro invalidato.',
      path: timeBrickPath('invalid', voice),
      filename: `time-invalid-${voice}.wav`,
      voice,
      speed: LAP_TIME_AUDIO_DEFAULT_SPEED,
    }
  }
  const tenths = lapTimeTenthsFromMs(timeMs)
  if (tenths === null || !isLapTimeVoiceTenthsInRange(tenths)) return null
  return buildLapTimeVoiceEntry(tenths, voice)
}

/**
 * Scompone un tempo giro nei mattoncini da riprodurre in sequenza.
 * Ritorna gli id dei mattoncini (senza voce/estensione).
 * - tempo nullo/non valido come numero: annuncia solo l'eventuale "giro non valido".
 * - sotto il minuto: niente mattoncino dei minuti.
 */
export function lapTimeToBricks(timeMs: number | null, valid: boolean): string[] {
  const bricks: string[] = []
  if (!valid) bricks.push('invalid')
  if (!timeMs || timeMs <= 0 || !Number.isFinite(timeMs)) return bricks

  const totalSecs = timeMs / 1000
  let minutes = Math.floor(totalSecs / 60)
  let secs = Math.floor(totalSecs % 60)
  let tenths = Math.round((totalSecs - Math.floor(totalSecs)) * 10)
  // Il decimo arrotondato puo' traboccare (es. 49.96s -> 49 e "10 decimi").
  if (tenths >= 10) {
    tenths = 0
    secs += 1
    if (secs >= 60) { secs = 0; minutes += 1 }
  }

  if (minutes > 0) bricks.push(`num-${Math.min(minutes, 59)}`)
  bricks.push(`num-${secs}`)
  bricks.push('e')
  bricks.push(`num-${tenths}`)
  return bricks
}
