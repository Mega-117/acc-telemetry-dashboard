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
    drops: intensity === null ? 0 : Math.min(intensity, 4),
    thunder: intensity === 5,
  }
}
