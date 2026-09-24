import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { accRainIntensity, raceWeatherItem } from '~/utils/raceWeatherPresentation'
import RaceWeatherIcon from '~/components/overlay/RaceWeatherIcon.vue'

describe('ACC Race weather', () => {
  it('preserves all six ACC categories with distinct accessible labels and symbols', async () => {
    const items = Array.from({ length: 6 }, (_, n) => raceWeatherItem(n, 10, true))
    expect(new Set(items.map(item => item.title)).size).toBe(6)
    const markup = await Promise.all(items.map(item => renderToString(createSSRApp(RaceWeatherIcon, { item }))))
    expect(new Set(markup).size).toBe(6)
    expect(items[0]!.title).toContain('Nessuna pioggia')
    expect(items[5]!.thunder).toBe(true)
    expect(items[3]!.title).toContain('10 minuti di gioco')
  })

  it.each([null, undefined, -1, 6, 0.2, NaN, Infinity, '0', false])('does not invent weather for %s', (value) => {
    expect(accRainIntensity(value)).toBeNull()
    expect(raceWeatherItem(value, 30, true).title).toContain('non disponibili')
  })

  it('discards stale data including apparently dry conditions', async () => {
    const item = raceWeatherItem(0, 0, false)
    expect(item.intensity).toBeNull()
    expect(await renderToString(createSSRApp(RaceWeatherIcon, { item }))).toContain('—')
  })
})
