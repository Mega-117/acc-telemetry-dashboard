import { useI18n } from '~/i18n'

/** ACC graphics rain enums are categorical (0..5), unlike UDP rain_level (0..1). */
export function accRainIntensity(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5
    ? value : null
}

// PIP-665: one label per ACC rain category (0..5), in the interface language.
const RAIN_KEYS = ['overlays.weather.rain0', 'overlays.weather.rain1', 'overlays.weather.rain2', 'overlays.weather.rain3', 'overlays.weather.rain4', 'overlays.weather.rain5'] as const

export function raceWeatherItem(value: unknown, minutes: number, fresh: boolean) {
  const { t } = useI18n()
  const intensity = fresh ? accRainIntensity(value) : null
  const label = t(intensity === null ? 'overlays.weather.noData' : RAIN_KEYS[intensity]!)
  return {
    intensity,
    horizon: `${minutes}′`,
    title: `${minutes === 0 ? t('overlays.weather.now') : t('overlays.weather.forecast', { minutes })}: ${label}`,
    glyph: raceWeatherGlyph(intensity),
    thunder: intensity === 5,
  }
}

export type RaceWeatherItem = ReturnType<typeof raceWeatherItem>

export interface RaceWeatherGlyph {
  kind: 'none' | 'sun' | 'rain'
  lines: 0 | 1 | 2 | 3
  letter: 'L' | 'M' | 'H' | null
  // Drizzle keeps its own (dotted) line so it never reads as light rain.
  dotted: boolean
  thunder: boolean
}

/**
 * HUD style v2 (27/10): white outline icons. ACC rain categories 0..5 map to
 * sun, then a cloud with L/M/H and 1/2/3 lines; drizzle is L with a dotted line,
 * thunderstorm is H with a bolt. ACC exposes no cloud cover, so no plain cloud.
 */
export function raceWeatherGlyph(intensity: number | null): RaceWeatherGlyph {
  if (intensity === null) return { kind: 'none', lines: 0, letter: null, dotted: false, thunder: false }
  if (intensity === 0) return { kind: 'sun', lines: 0, letter: null, dotted: false, thunder: false }
  if (intensity <= 2) return { kind: 'rain', lines: 1, letter: 'L', dotted: intensity === 1, thunder: false }
  if (intensity === 3) return { kind: 'rain', lines: 2, letter: 'M', dotted: false, thunder: false }
  return { kind: 'rain', lines: 3, letter: 'H', dotted: false, thunder: intensity === 5 }
}

/** One cell per horizon the data actually provides; all placeholders while nothing is known. */
export function raceWeatherCells(items: readonly RaceWeatherItem[]): RaceWeatherItem[] {
  const known = items.filter(item => item.intensity !== null)
  return known.length > 0 ? known : [...items]
}
