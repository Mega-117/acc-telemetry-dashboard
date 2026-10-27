import { describe, expect, it } from 'vitest'
import { setLocale } from '~/i18n'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { accRainIntensity, raceWeatherCells, raceWeatherGlyph, raceWeatherItem } from '~/utils/raceWeatherPresentation'
import RaceWeatherIcon from '~/components/overlay/RaceWeatherIcon.vue'

// The HUD texts below are asserted in Italian (jsdom defaults to English).
setLocale('it')

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

  it('follows the interface language for the tooltip only', () => {
    setLocale('en')
    expect(raceWeatherItem(0, 0, true).title).toBe('Now: No rain')
    expect(raceWeatherItem(5, 30, true).title).toBe('ACC forecast in 30 game minutes: Thunderstorm')
    expect(raceWeatherItem(5, 30, true).horizon).toBe('30′')
    setLocale('it')
    expect(raceWeatherItem(0, 0, true).title).toBe('Ora: Nessuna pioggia')
  })
})

describe('HUD style v2 weather strip (27/10)', () => {
  it('maps the six ACC categories to sun or cloud with L/M/H and 1/2/3 lines', () => {
    expect(raceWeatherGlyph(null)).toMatchObject({ kind: 'none' })
    expect(raceWeatherGlyph(0)).toMatchObject({ kind: 'sun', lines: 0, letter: null })
    // Drizzle reads as light rain, with a dotted line so the two stay distinct.
    expect(raceWeatherGlyph(1)).toMatchObject({ kind: 'rain', lines: 1, letter: 'L', dotted: true, thunder: false })
    expect(raceWeatherGlyph(2)).toMatchObject({ kind: 'rain', lines: 1, letter: 'L', dotted: false })
    expect(raceWeatherGlyph(3)).toMatchObject({ kind: 'rain', lines: 2, letter: 'M' })
    expect(raceWeatherGlyph(4)).toMatchObject({ kind: 'rain', lines: 3, letter: 'H', thunder: false })
    // Thunderstorm reads as heavy rain plus a bolt.
    expect(raceWeatherGlyph(5)).toMatchObject({ kind: 'rain', lines: 3, letter: 'H', thunder: true })
  })

  it('renders white outline icons with the letter and the rain lines', async () => {
    const html = await renderToString(createSSRApp(RaceWeatherIcon, { item: raceWeatherItem(3, 30, true) }))
    expect(html).toContain('fill="none"')
    expect(html).toMatch(/race-weather-icon__letter[^>]*>M</)
    expect(html.match(/d="M\d+ 22l-1.5 4"/g)).toHaveLength(2)
    expect(html).not.toContain('#ffd45b')
  })

  it('shows one cell per forecast the data provides, and placeholders while nothing is known', () => {
    const items = [raceWeatherItem(0, 0, true), raceWeatherItem(null, 10, true), raceWeatherItem(4, 30, true)]
    expect(raceWeatherCells(items).map(item => item.horizon)).toEqual(['0′', '30′'])
    expect(raceWeatherCells([items[1]!]).map(item => item.horizon)).toEqual(['10′'])
    const stale = [0, 10, 30].map(minutes => raceWeatherItem(1, minutes, false))
    expect(raceWeatherCells(stale)).toHaveLength(3)
    expect(raceWeatherCells(stale).every(item => item.glyph.kind === 'none')).toBe(true)
  })
})
