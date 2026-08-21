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
    },
    layout: {
      width: 486,
      height: 384,
      rowCapacity: 10,
      paddingX: 10,
      paddingY: 10,
      headerHeight: 48,
      rowHeight: 28,
      rowGap: 4,
      columnGap: 8,
      columnWidths: {
        position: 30,
        driver: 140,
        carNumber: 50,
        pit: 22,
        bestLap: 92,
        lastLap: 92,
        progress: 76,
      },
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
      local: true,
    }],
    message: null,
    columns: { carNumber: true, lastLap: true, bestLap: true, progress: true },
  }
}

describe('StandingsHud DOM', () => {
  it('monta header e sole celle reference nell’ordine supportato', async () => {
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: model(),
      backgroundOpacity: 0.5,
    }))

    const headerValues = ['Practice', '01:02:03', '22/32°', 'Best', 'Last']
    const indexes = headerValues.map(value => html.indexOf(value))
    expect(indexes.every(index => index >= 0)).toBe(true)
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
    for (const value of ['V. Rossi', '46', '>P<', '2:16.500', '2:17.001']) {
      expect(html).toContain(value)
    }
    expect(html).not.toContain('is-improved')
    expect(html).toMatch(/class="[^"]*standings-row[^"]*is-local|class="[^"]*is-local[^"]*standings-row/)
    expect(html).toContain('standings-row__progress-track')
    expect(html).toContain('standings-row__progress')
    expect(html).toMatch(/class="[^"]*is-fastest[^"]*standings-row__best|class="[^"]*standings-row__best[^"]*is-fastest/)
    expect(html).toMatch(/class="[^"]*is-pb-focused[^"]*standings-row__last|class="[^"]*standings-row__last[^"]*is-pb-focused/)
  })

  it('monta solo le label Best/Last, senza categoria o campi inventati', async () => {
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: model(),
      backgroundOpacity: 0.5,
    }))
    expect(html).not.toContain('STANDINGS')
    expect(html).not.toMatch(/>POS<|>DRIVER<|>PIT</)
    expect(html).toMatch(/>Best<.*>Last</s)
    expect(html).toContain('standings-columns')
    expect(html).not.toContain('is-focused')
    expect(html).toContain('is-local')
    expect(html).not.toContain('AIR/TRK')
    expect(html).not.toContain('teamName')
    expect(html).not.toContain('row.delta')
    expect(html).not.toContain('GT3')
  })

  it('mantiene il bordo progress a tutta riga a zero senza classi highlight', async () => {
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
    expect(html).toContain('standings-row__progress-track')
    expect(html).toContain('width:0%')
  })

  it('mostra il messaggio neutro di recovery dentro il pannello senza nascondere la riga locale', async () => {
    const recovering = model()
    recovering.message = 'Classifica in aggiornamento…'
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: recovering,
      backgroundOpacity: 0.5,
    }))

    expect(html).toContain('Classifica in aggiornamento…')
    expect(html).toContain('V. Rossi')
    expect(html).toContain('standings-recovery')
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
