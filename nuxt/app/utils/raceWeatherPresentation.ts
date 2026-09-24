/** ACC graphics rain enums are categorical (0..5), unlike UDP rain_level (0..1). */
export function accRainIntensity(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5
    ? value : null
}

const RAIN_LABELS = ['Nessuna pioggia', 'Pioviggine', 'Pioggia leggera', 'Pioggia moderata', 'Pioggia forte', 'Temporale']

export function raceWeatherItem(value: unknown, minutes: number, fresh: boolean) {
  const intensity = fresh ? accRainIntensity(value) : null
  const label = intensity === null ? 'Dati meteo non disponibili' : RAIN_LABELS[intensity]!
  return {
    intensity,
    horizon: `${minutes}′`,
    title: `${minutes === 0 ? 'Ora' : `Previsione ACC a ${minutes} minuti di gioco`}: ${label}`,
    drops: intensity === null ? 0 : Math.min(intensity, 4),
    thunder: intensity === 5,
  }
}
