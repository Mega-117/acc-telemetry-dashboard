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
      width: 590,
      height: 384,
      rowCapacity: 10,
      paddingX: 10,
      paddingY: 10,
      headerHeight: 48,
      rowHeight: 28,
      rowGap: 4,
      columnGap: 8,
      vehicleGap: 4,
      columnWidths: {
        position: 30,
        driver: 140,
        manufacturer: 28,
        carNumber: 50,
        pit: 22,
        bestLap: 92,
        lastLap: 92,
        progress: 76,
        gap: 64,
      },
    },
    rows: [{
      carIndex: 7,
      position: 2,
      positionFlash: 'improved',
      carNumber: '46',
      carNumberVariant: 'pro-am',
      manufacturerCode: 'FER',
      manufacturerName: 'Ferrari',
      driverName: 'V. Rossi',
      inPitLane: true,
      relativeGap: '--.-',
      relativeGapTone: 'neutral',
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

    const headerValues = ['Practice', '01:02:03', '22/32°', 'Best', 'Last', 'Gap']
    const indexes = headerValues.map(value => html.indexOf(value))
    expect(indexes.every(index => index >= 0)).toBe(true)
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
    for (const value of ['V. Rossi', 'FER', '46', '>P<', '2:16.500', '2:17.001', '--.-']) {
      expect(html).toContain(value)
    }
    expect(html).not.toContain('is-improved')
    expect(html).toMatch(/class="[^"]*standings-row[^"]*is-local|class="[^"]*is-local[^"]*standings-row/)
    expect(html).toContain('standings-row__progress-track')
    expect(html).toContain('standings-row__progress')
    expect(html).toMatch(/class="[^"]*is-fastest[^"]*standings-row__best|class="[^"]*standings-row__best[^"]*is-fastest/)
    expect(html).toMatch(/class="[^"]*is-pb-focused[^"]*standings-row__last|class="[^"]*standings-row__last[^"]*is-pb-focused/)
    expect(html).toMatch(/class="[^"]*standings-row__number[^"]*has-number|class="[^"]*has-number[^"]*standings-row__number/)
    expect(html).toContain('standings-row__manufacturer')
    expect(html).toContain('aria-label="Ferrari"')
    expect(html).toMatch(/class="[^"]*standings-row__gap[^"]*is-neutral|class="[^"]*is-neutral[^"]*standings-row__gap/)
    expect(html).toMatch(/class="[^"]*standings-row__number[^"]*is-pro-am|class="[^"]*is-pro-am[^"]*standings-row__number/)
    expect(html).toMatch(/class="[^"]*standings-row__pit[^"]*is-active|class="[^"]*is-active[^"]*standings-row__pit/)
    expect(html).not.toContain('rgb(38, 38, 69)')
  })

  it('mantiene trasparenti le celle prive di numero e le auto non ai box', async () => {
    const inactive = model()
    inactive.rows[0].carNumber = null
    inactive.rows[0].inPitLane = false
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: inactive,
      backgroundOpacity: 0.5,
    }))

    expect(html).toContain('standings-row__number')
    expect(html).toContain('standings-row__pit')
    expect(html).not.toContain('has-number')
    expect(html).not.toContain('is-active')
  })

  it('rende le quattro palette equipaggio e il fallback senza esporre CupCategory al template', async () => {
    const variants = ['pro', 'pro-am', 'am', 'silver', 'neutral'] as const
    const palette = model()
    palette.rows = variants.map((variant, index) => ({
      ...palette.rows[0],
      carIndex: index + 1,
      carNumber: String(index + 1),
      carNumberVariant: variant,
    }))
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: palette,
      backgroundOpacity: 0.5,
    }))

    for (const variant of variants) expect(html).toContain(`is-${variant}`)
    expect(html).not.toContain('cup_category')
  })

  it('monta solo le label Best/Last, senza categoria o campi inventati', async () => {
    const html = await renderToString(createSSRApp(StandingsHud, {
      model: model(),
      backgroundOpacity: 0.5,
    }))
    expect(html).not.toContain('STANDINGS')
    expect(html).not.toMatch(/>POS<|>DRIVER<|>PIT</)
    expect(html).toMatch(/>Best<.*>Last<.*>Gap</s)
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
