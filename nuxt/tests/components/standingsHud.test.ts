import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import { describe, expect, it } from 'vitest'
import StandingsHud from '../../app/components/overlay/StandingsHud.vue'
import type { StandingsPresentation } from '../../app/services/overlay/standingsPresentation'

function model(): StandingsPresentation {
  return {
    visible: true,
    header: {
      sessionType: 'Practice',
      timeLeft: '01:02:03',
      temperatures: '22/32°',
      carClass: 'GT3',
    },
    rows: [{
      carIndex: 7,
      position: 2,
      positionFlash: 'improved',
      carNumber: '46',
      carNumberColors: { background: 'rgb(38, 38, 69)', color: 'white' },
      driverName: 'V. Rossi',
      inPitLane: true,
      lastLap: '2:17.001',
      bestLap: '2:16.500',
      fastestInClass: true,
      lastLapPersonalBest: 'focused',
      progressPercent: 42,
      hasProgress: true,
      focused: true,
    }],
    columns: { carNumber: true, lastLap: true, bestLap: true, progress: true },
  }
}

describe('StandingsHud DOM', () => {
  it('monta header e sole celle reference nell’ordine supportato', async () => {
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: model(),
      backgroundOpacity: 0.5,
    }))

    const headerValues = ['Practice', '01:02:03', '22/32°', 'GT3']
    const indexes = headerValues.map(value => html.indexOf(value))
    expect(indexes.every(index => index >= 0)).toBe(true)
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
    for (const value of ['V. Rossi', '46', '>P<', '2:16.500', '2:17.001']) {
      expect(html).toContain(value)
    }
    expect(html).toMatch(/class="[^"]*is-improved[^"]*standings-row__position|class="[^"]*standings-row__position[^"]*is-improved/)
    expect(html).toMatch(/class="[^"]*has-progress[^"]*standings-row|class="[^"]*standings-row[^"]*has-progress/)
    expect(html).toMatch(/class="[^"]*is-fastest[^"]*standings-row__best|class="[^"]*standings-row__best[^"]*is-fastest/)
    expect(html).toMatch(/class="[^"]*is-pb-focused[^"]*standings-row__last|class="[^"]*standings-row__last[^"]*is-pb-focused/)
  })

  it('non monta titoli, column label, team, gap o focus full-row inventati', async () => {
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: model(),
      backgroundOpacity: 0.5,
    }))
    expect(html).not.toContain('STANDINGS')
    expect(html).not.toMatch(/>POS<|>DRIVER<|>PIT<|>BEST<|>LAST</)
    expect(html).not.toContain('standings-columns')
    expect(html).not.toContain('is-focused')
    expect(html).not.toContain('AIR/TRK')
    expect(html).not.toContain('teamName')
    expect(html).not.toContain('row.delta')
  })

  it('non aggiunge altezza progress o classi highlight quando le celle sono inattive', async () => {
    const inactive = model()
    inactive.rows[0].positionFlash = null
    inactive.rows[0].lastLapPersonalBest = null
    inactive.rows[0].progressPercent = 0
    inactive.rows[0].hasProgress = false
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: inactive,
      backgroundOpacity: 0.5,
    }))
    expect(html).not.toContain('has-progress')
    expect(html).not.toContain('is-improved')
    expect(html).not.toContain('is-pb-')
    expect(html).not.toContain('standings-row__progress')
  })

  it('non monta il contenitore quando il modello non è affidabile', async () => {
    const hidden = model()
    hidden.visible = false
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: hidden,
      backgroundOpacity: 0.5,
    }))
    expect(html).not.toContain('class="standings-hud"')
  })
})
