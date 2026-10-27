import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSSRApp, h } from 'vue'
import { renderToString as renderRawToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { setLocale } from '~/i18n'
import SectorDeltaHud from '~/components/overlay/SectorDeltaHud.vue'
import { commonSectorHud } from '~/services/telemetry/commonSectorHud'
import type { CommonLive } from '~/services/telemetry/commonLive'
import type { SectorHudEntry, SectorHudState } from '~/composables/useLiveStatePoller'

// The HUD texts below are asserted in Italian (jsdom defaults to English).
setLocale('it')

// Live times render one fixed-width slot per glyph (HudFixedDigits). The text
// assertions below read the plain string back, as a screen reader would.
function flattenFixedDigits(html: string): string {
  return html
    .replace(/<span class="hud-fixed-digits__glyph"[^>]*>([^<]*)<\/span>/g, '$1')
    .replace(/<!--\[-->|<!--\]-->/g, '')
    .replace(/<span class="hud-fixed-digits"[^>]*>([^<]*)<\/span>/g, '$1')
}

async function renderToString(app: Parameters<typeof renderRawToString>[0]): Promise<string> {
  return flattenFixedDigits(await renderRawToString(app))
}

it.each(['compact', 'classic'])('renders the three EVO game-log splits through the shared %s HUD', async variant => {
  const source: CommonLive = { gameId: 'evo', sessionId: 'monza', connected: true, fresh: true,
    lifecycle: 'live', sessionKind: 'practice', identity: { track: 'Monza', car: 'Ferrari', variant: 'GP' },
    capabilities: { sector_timing: true }, fields: {
      sector_count: { value: 3, availability: 'available', unit: 'count' },
      ...Object.fromEntries([36276, 38997, 37581].map((value, i) => [`sector.${i + 1}.time`, { value, availability: 'available', unit: 'ms' }])),
    } }
  const html = await renderToString(createSSRApp({ render: () => h(SectorDeltaHud, { sectorHud: commonSectorHud(source), variant: variant as 'compact' | 'classic' }) }))
  for (const split of ['36.276', '38.997', '37.581']) expect(html).toContain(split)
  expect(commonSectorHud({ ...source, fresh: false })).toBeNull()
})

function entry(index: 1 | 2 | 3): SectorHudEntry {
  return {
    index,
    state: 'complete',
    currentMs: 30_800 + index,
    referenceMs: 31_000 + index,
    bestMs: 30_500 + index,
    bestReferenceMs: 30_500 + index,
    deltaMs: -200,
    color: 'green',
  }
}

const sectorHud: SectorHudState = {
  version: 1,
  mode: 'running',
  lap: 3,
  referenceLap: 2,
  currentSectorIndex: 0,
  currentLapTimeMs: 0,
  lastLapTimeMs: null,
  bestLapTimeMs: null,
  lapValid: true,
  awaitingFlyingLap: false,
  sectors: [entry(1), entry(2), entry(3)],
}

async function renderHud(props: Record<string, unknown>): Promise<string> {
  return renderToString(createSSRApp({
    render: () => h(SectorDeltaHud, { sectorHud, ...props }),
  }))
}

describe('SectorDeltaHud', () => {
  it.each(['classic', 'compact'])('names the held previous lap only in the title bar (%s)', async variant => {
    const held = await renderHud({ variant, sectorHud: { ...sectorHud, mode: 'last_lap' }, compactDisplayLap: { timeMs: 91000, valid: true } })
    // The lap tile has no label: the title bar alone says the last lap is shown.
    const title = variant === 'compact' ? /<b[^>]*>ULTIMO GIRO<\/b> VS BEST/ : /sector-delta-hud__title"[^>]*>SETTORI · ULTIMO GIRO</
    expect(held).toMatch(title)
    expect(held.match(/ULTIMO GIRO/g)).toHaveLength(1)
    expect(await renderHud({ variant })).not.toContain('ULTIMO GIRO')
  })
  it.each(['classic', 'compact'])('has no text label above the running lap time (%s)', async variant => {
    for (const mode of ['running', 'last_lap'] as const) {
      const html = await renderHud({ variant, sectorHud: { ...sectorHud, mode }, compactDisplayLap: { timeMs: 91000, valid: true }, targetOutcome: 'inside' })
      expect(html).not.toMatch(/lap-label/)
      expect(html).not.toContain('GIRO IN CORSO')
      expect(html).not.toContain('NEL TARGET')
    }
  })
  it.each(['classic', 'compact'])('does not invent ACC sectors when a common source has no cardinality (%s)', async variant => {
    const html = await renderHud({ sectorHud: null, idleSectorCount: 0, variant })
    expect(html).toContain('Settori non disponibili')
    expect(html).not.toMatch(/>S[123]</)
    const acc = await renderHud({ sectorHud: null, idleSectorCount: 3, variant })
    expect(acc).not.toContain('Settori non disponibili')
    expect(acc).toContain('S3')
  })
  it('keeps two and four sectors on the same classic row instead of clipping a fourth sector', async () => {
    for (const count of [2, 3, 4]) {
      const sectors = Array.from({ length: count }, (_, i) => ({ ...entry(1), index: i + 1 }))
      const html = await renderHud({ sectorHud: { ...sectorHud, sectors } })
      expect(html).toContain(`grid-template-columns:repeat(${count}, minmax(0, 1fr))`)
      expect(html.match(/class="sector-delta__label"/g)).toHaveLength(count)
    }
  })
  it('shows outside feedback only as the compact tile colour, leaving classic unchanged', async () => {
    const props = { compactDisplayLap: { timeMs: 91_000, valid: true }, targetOutcome: 'outside' }
    const compact = await renderHud({ ...props, variant: 'compact' })
    expect(compact).not.toContain('FUORI TARGET')
    expect(compact).toContain('sector-compact__lap--target-outside')
    const classic = await renderHud({ ...props, variant: 'classic' })
    expect(classic).not.toContain('sector-compact__lap--target-outside')
  })

  it('centra insieme SETTORI e il confronto nel layout a tre riquadri', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/pages/sectors-overlay.vue'),
      'utf8',
    )

    expect(source).toMatch(
      /\.hud-overlay \.sector-delta-hud__header--classic\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*center;[^}]*gap:\s*calc\(8px \* var\(--hud-scale\)\);/s,
    )
    expect(source).not.toMatch(
      /\.hud-overlay \.sector-delta-hud__comparison\s*\{[^}]*justify-self:\s*end;/s,
    )
  })

  it('centra la testata compatta sull intero contenitore con linee simmetriche', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/overlay/SectorDeltaHud.vue'),
      'utf8',
    )

    expect(source).toMatch(
      /\.sector-compact__title\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\);/s,
    )
    expect(source).toMatch(
      /\.sector-compact__title::before,[\s\S]*?\.sector-compact__title::after\s*\{[^}]*width:\s*100%;/,
    )
    expect(source).not.toContain('width: calc(104px * var(--hud-scale, 1));')
  })

  it('nasconde davvero il best senza cambiare il delta selezionato', async () => {
    const html = await renderHud({
      showBest: false,
      showReference: true,
      deltaReference: 'bestSector',
    })

    expect(html).not.toContain('sector-delta__best')
    expect(html).toContain('sector-delta__ref')
    expect(html).toContain('+0.300')
    expect(html).toContain('SETTORI')
    expect(html).toContain('VS BEST')
  })

  it('PIP-524: le checkbox di visibilità non cambiano il delta, sempre contro il best', async () => {
    const html = await renderHud({
      showBest: false,
      showReference: false,
      deltaReference: 'previousLap',
    })

    expect(html).not.toContain('sector-delta__best')
    expect(html).not.toContain('sector-delta__ref')
    // A saved previous-lap reference now reads as best: 30_801 - 30_501.
    expect(html).toContain('+0.300')
    expect(html).toContain('SETTORI')
    expect(html).toContain('VS BEST')
  })

  it('mostra wait senza fallback quando manca il best selezionato', async () => {
    const missingBest = { ...sectorHud, sectors: sectorHud.sectors.map(item => ({ ...item, bestReferenceMs: null })) }
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, { sectorHud: missingBest, deltaReference: 'bestSector' }),
    }))

    expect(html).toContain('>wait</small>')
    expect(html).not.toContain('-0.200</small>')
  })

  it('rende il layout compatto con cronometro e sole tre righe essenziali', async () => {
    const compactHud: SectorHudState = {
      ...sectorHud,
      currentLapTimeMs: 83_456,
      sectors: sectorHud.sectors.map((item, index) => ({
        ...item,
        state: index === 1 ? 'running' : index === 2 ? 'pending' : item.state,
        currentMs: index > 0 ? null : item.currentMs,
        deltaMs: index > 0 ? null : item.deltaMs,
      })),
    }
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: compactHud,
        variant: 'compact',
        showReference: true,
        showBest: true,
        deltaReference: 'previousLap',
        liveRunning: true,
      }),
    }))

    expect(html).toMatch(/SETTORI<\/b> VS BEST/)
    expect(html).toContain('01:23.456')
    expect(html).not.toContain('GIRO IN CORSO')
    expect((html.match(/sector-compact__label/g) || []).length).toBe(3)
    expect(html).not.toContain('sector-delta__ref')
    expect(html).not.toContain('sector-delta__best')
    expect(html).not.toContain('sector-compact__number--updating')
    expect(html).toContain('52.655')
  })

  it('nasconde il tempo hero senza rimuovere header o righe compatte', async () => {
    const html = await renderHud({
      variant: 'compact',
      showCurrentLap: false,
      compactDisplayLap: { timeMs: 83_456, valid: true },
    })

    expect(html).toMatch(/SETTORI<\/b> VS BEST/)
    expect(html).not.toContain('01:23.456')
    expect(html).not.toContain('GIRO IN CORSO')
    expect(html).not.toContain('sector-compact__lap--invalid')
    expect((html.match(/sector-compact__label/g) || []).length).toBe(3)

    const classic = await renderHud({ variant: 'classic', showCurrentLap: false })
    expect(classic).toContain('sector-delta-hud__grid')
  })

  it('rende neutra la validita mancante senza fallback ottimistico', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: null,
        variant: 'compact',
        compactDisplayLap: { timeMs: 12_345, valid: null },
      }),
    }))

    expect(html).toContain('sector-compact__lap--unknown')
    expect(html).not.toContain('sector-compact__lap--invalid')
  })

  it('adatta soltanto i tempi settore a tre cifre nel layout compatto', async () => {
    const longSectorHud: SectorHudState = {
      ...sectorHud,
      currentLapTimeMs: 154_257,
      sectors: [
        { ...entry(1), currentMs: 30_801 },
        { ...entry(2), state: 'running', currentMs: 123_456, deltaMs: null },
        { ...entry(3), state: 'pending', currentMs: null, deltaMs: null },
      ],
    }
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: longSectorHud,
        variant: 'compact',
      }),
    }))

    expect(html).toContain('123.456')
    expect(html).toContain('sector-compact__time-value--long')
  })

  it('usa il timer Info live per far avanzare current lap e settore attivo tra gli eventi settore', async () => {
    const eventDrivenHud: SectorHudState = {
      ...sectorHud,
      currentLapTimeMs: 41_250,
      sectors: [
        { ...entry(1), currentMs: 41_232, deltaMs: null },
        { ...entry(2), state: 'running', currentMs: 18, deltaMs: null },
        { ...entry(3), state: 'pending', currentMs: null, deltaMs: null },
      ],
    }

    const first = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: eventDrivenHud,
        variant: 'compact',
        liveRunning: true,
        liveCurrentLapTimeMs: 43_050,
        compactDisplayLap: { timeMs: 43_050, valid: true },
      }),
    }))
    const second = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: eventDrivenHud,
        variant: 'compact',
        liveRunning: true,
        liveCurrentLapTimeMs: 44_850,
        compactDisplayLap: { timeMs: 44_850, valid: false },
      }),
    }))

    expect(first).toContain('00:43.050')
    expect(first).toContain('1.818')
    expect(first).not.toContain('sector-compact__lap--invalid')
    expect(second).toContain('00:44.850')
    expect(second).toContain('3.618')
    expect(second).not.toContain('0:41.250')
    expect(second).not.toContain('>0.018</span>')
    expect(second).toContain('sector-compact__lap--invalid')
  })

  it('usa tempo e validita dello stesso giro completato durante l hold', async () => {
    const runningHud: SectorHudState = {
      ...sectorHud,
      lapValid: false,
      sectors: [
        { ...entry(1), currentMs: 41_232, deltaMs: null },
        { ...entry(2), state: 'running', currentMs: 18, deltaMs: null },
        { ...entry(3), state: 'pending', currentMs: null, deltaMs: null },
      ],
    }
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: runningHud,
        variant: 'compact',
        liveRunning: true,
        liveCurrentLapTimeMs: 44_850,
        compactDisplayLap: { timeMs: 141_250, valid: true },
      }),
    }))

    expect(html).toContain('02:21.250')
    expect(html).toContain('3.618')
    expect(html).not.toContain('sector-compact__lap--invalid')

    const invalidCompleted = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: { ...runningHud, lapValid: true },
        variant: 'compact',
        compactDisplayLap: { timeMs: 142_500, valid: false },
      }),
    }))
    expect(invalidCompleted).toContain('02:22.500')
    expect(invalidCompleted).toContain('sector-compact__lap--invalid')
  })

  it('aggiorna la testata compatta dal riferimento delta selezionato', async () => {
    const previous = await renderHud({ variant: 'compact', deltaReference: 'previousLap' })
    const best = await renderHud({ variant: 'compact', deltaReference: 'bestSector' })

    // PIP-524: there is no LAST comparison any more.
    expect(previous).toMatch(/SETTORI<\/b> VS BEST/)
    expect(best).toMatch(/SETTORI<\/b> VS BEST/)
    expect(previous).not.toContain('LAST')
  })

  it('mostra il current lap Info disponibile senza sbloccare i settori ancora in Wait', async () => {
    const waitingHud: SectorHudState = {
      ...sectorHud,
      awaitingFlyingLap: true,
      currentLapTimeMs: null,
      sectors: sectorHud.sectors.map(item => ({
        ...item,
        state: 'pending',
        currentMs: null,
        deltaMs: null,
      })),
    }
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: waitingHud,
        variant: 'compact',
        compactDisplayLap: { timeMs: 2_921_192, valid: false },
      }),
    }))

    expect(html).toContain('48:41.192')
    expect(html).toContain('sector-compact__lap--invalid')
    expect((html.match(/>wait<\/small>/g) || []).length).toBe(3)
  })

  it('mantiene il placeholder quando il timer Info non è disponibile', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: { ...sectorHud, currentLapTimeMs: 12_345 },
        variant: 'compact',
        liveCurrentLapTimeMs: null,
      }),
    }))

    expect(html).toContain('--:--.---')
    expect(html).not.toContain('00:12.345')
  })

  it('colora di rosso il cronometro compatto quando il giro è invalido e conserva Wait senza fallback', async () => {
    const invalidHud: SectorHudState = {
      ...sectorHud,
      lapValid: false,
      sectors: sectorHud.sectors.map(item => ({ ...item, bestReferenceMs: null })),
    }
    const html = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: invalidHud,
        variant: 'compact',
        deltaReference: 'bestSector',
      }),
    }))

    expect(html).toContain('sector-compact__lap--invalid')
    expect((html.match(/>wait<\/small>/g) || []).length).toBe(3)
    expect(html).not.toContain('-0.200</small>')
  })
  it('mostra l esito Target sul bordo senza cambiare il colore di validita', async () => {
    const inside = await renderHud({
      variant: 'compact',
      compactDisplayLap: { timeMs: 90_000, valid: true },
      targetOutcome: 'inside',
    })
    const outsideInvalid = await renderHud({
      variant: 'compact',
      compactDisplayLap: { timeMs: 91_000, valid: false },
      targetOutcome: 'outside',
    })
    const hidden = await renderHud({
      variant: 'compact',
      showCurrentLap: false,
      compactDisplayLap: { timeMs: 90_000, valid: true },
      targetOutcome: 'inside',
    })

    expect(inside).toContain('sector-compact__lap--target-inside')
    expect(inside).not.toContain('sector-compact__lap--invalid')
    expect(inside).not.toContain('NEL TARGET')
    expect(outsideInvalid).not.toContain('sector-compact__lap--target-outside')
    expect(outsideInvalid).not.toContain('FUORI TARGET')
    expect(outsideInvalid).toContain('sector-compact__lap--invalid')
    expect(hidden).not.toContain('sector-compact__lap--target-inside')
    expect(hidden).not.toContain('GIRO IN CORSO')
  })

})

// PIP-524: both layouts show custom deltas in thousandths with the same minus
// sign, so a "+0.0" can no longer be green in one case and red in another.
it.each(['compact','classic'])('renders custom independent deltas in thousandths in %s', async variant => {
 const html=await renderHud({variant, deltaReference:'custom', customSectorTimes:[31000,30000,32000]})
 expect(html).toContain('CUSTOM')
 expect(html).toContain('>−0.199</small>')
 expect(html).toContain('>+0.802</small>')
 expect(html).toContain('>−1.197</small>')
})

it.each(['compact','classic'])('keeps exactly zero custom delta in thousandths in %s', async variant => {
 const exact={...sectorHud,sectors:sectorHud.sectors.map((entry,index)=>({...entry,currentMs:[32500,27000,16800][index]}))}
 const html=await renderHud({sectorHud:exact,variant,deltaReference:'custom',customSectorTimes:[32500,27000,16800]})
 expect(html).toContain('>+0.000</small>')
})

describe.each(['custom', 'previousLap', 'bestSector'])('compact %s millisecond precision', deltaReference => {
  it.each([
    { deltas: [-425, 1285, -4], expected: ['−0.425', '+1.285', '−0.004'] },
    { deltas: [-1234.5, 1234.5, -0.49], expected: ['−1.235', '+1.235', '+0.000'] },
    { deltas: [-0.5, 0.5, 0], expected: ['−0.001', '+0.001', '+0.000'] },
    { deltas: [-999.5, 999.5, 0.49], expected: ['−1.000', '+1.000', '+0.000'] },
  ])('renders $deltas with symmetric rounding and unsigned zero', async ({ deltas, expected }) => {
    const hud = { ...sectorHud, sectors: sectorHud.sectors.map((item, index) => ({
      ...item, currentMs: 30000 + deltas[index], referenceMs: 30000, bestReferenceMs: 30000, deltaMs: deltas[index],
    })) }
    const html = await renderHud({ sectorHud: hud, variant: 'compact', deltaReference, customSectorTimes: [30000, 30000, 30000] })
    const values = [...html.matchAll(/class="sector-compact__delta[^"]*"[^>]*>([^<]*)</g)].map(match => match[1])
    expect(values).toEqual(expected)
  })
})

describe('HUD style v2 (27/10) sectors', () => {
  it('classic: title bar, lap tile with the shown lap, PREV/BEST minis per sector', async () => {
    const html = await renderHud({ variant: 'classic', showReference: true, showBest: true, compactDisplayLap: { timeMs: 103_607, valid: true } })
    expect(html).toContain('sector-delta-hud__lap')
    expect(html).not.toContain('sector-delta-hud__lap-label')
    expect(html).toMatch(/class="sector-delta-hud__lap-time"[^>]*>01:43.607</)
    expect(html.match(/class="sector-delta__minis"/g)).toHaveLength(3)
    // Previous lap first, then best, each a boxed label + value.
    expect(html).toMatch(/sector-delta__ref[^>]*>[\s\S]*?<b[^>]*>prec<\/b><em[^>]*>31.001<\/em>[\s\S]*?sector-delta__best[^>]*>[\s\S]*?<b[^>]*>best<\/b><em[^>]*>30.501<\/em>/)
    const page = readFileSync(resolve(process.cwd(), 'app/pages/sectors-overlay.vue'), 'utf8')
    expect(page).toMatch(/\.sector-delta__ref,\s*\.hud-overlay \.sector-delta__best\s*\{[\s\S]*?text-transform:\s*uppercase/)
    expect(page).toMatch(/\.sector-delta-hud__lap-time\s*\{[^}]*color:\s*#facc15/)
  })

  it('classic: the lap tile keeps the invalid and unknown colours and hides with the setting', async () => {
    expect(await renderHud({ variant: 'classic', compactDisplayLap: { timeMs: 90_000, valid: false } })).toMatch(/sector-delta-hud__lap-time[^"]*sector-compact__lap--invalid|sector-compact__lap--invalid[^"]*sector-delta-hud__lap-time/)
    expect(await renderHud({ variant: 'classic', compactDisplayLap: { timeMs: 90_000, valid: null } })).toContain('sector-compact__lap--unknown')
    const hidden = await renderHud({ variant: 'classic', showCurrentLap: false })
    expect(hidden).not.toContain('sector-delta-hud__lap')
    expect(hidden).toContain('sector-delta-hud__grid')
  })

  it('both layouts follow the interface language for the last-lap title', async () => {
    setLocale('en')
    try {
      for (const variant of ['classic', 'compact']) {
        const html = await renderHud({ variant, compactDisplayLap: { timeMs: 90_000, valid: true } })
        expect(html).not.toContain('CURRENT LAP')
        expect(html).toContain('SECTORS')
        const held = await renderHud({ variant, sectorHud: { ...sectorHud, mode: 'last_lap' }, compactDisplayLap: { timeMs: 90_000, valid: true } })
        expect(held).toMatch(variant === 'compact' ? /<b[^>]*>LAST LAP<\/b>/ : /SECTORS · LAST LAP/)
      }
    } finally {
      setLocale('it')
    }
  })

  it('the page feeds the classic lap tile with the same lap as Compact', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/sectors-overlay.vue'), 'utf8')
    expect(page).toMatch(/variant="classic"\s*:live-current-lap-time-ms="liveCurrentLapTimeMs"\s*:compact-display-lap="compactDisplayLap"/)
  })
})

describe('fixed-width live times', () => {
  it.each(['classic', 'compact'])('splits lap time, sector times and deltas into aria-hidden slots (%s)', async variant => {
    const html = await renderRawToString(createSSRApp({
      render: () => h(SectorDeltaHud, { sectorHud, variant, compactDisplayLap: { timeMs: 101_234, valid: true } }),
    }))
    // Screen readers get the plain string on the wrapper; each glyph is hidden.
    for (const value of ['01:41.234', '30.801', '+0.300']) {
      expect(html).toContain(`class="hud-fixed-digits" aria-label="${value}"`)
    }
    expect(html).toMatch(/class="hud-fixed-digits__glyph" style="width:0.66em;"[^>]*aria-hidden="true"[^>]*>1<\/span>/)
    expect(html).toMatch(/class="hud-fixed-digits__glyph" style="width:0.25em;"[^>]*aria-hidden="true"[^>]*>:<\/span>/)
    expect(html).not.toContain('aria-label="wait"')
  })
})

it('compact keeps extra, scale-proportional space between title bar and lap block', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/components/overlay/SectorDeltaHud.vue'), 'utf8')
  expect(source).toMatch(/\.sector-compact__header\s*\{[^}]*gap:\s*calc\(13px \* var\(--hud-scale, 1\)\)/)
})

describe('sectors overlay background', () => {
  it('feeds the shared background setting to the panel only, keeping text opaque', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/pages/sectors-overlay.vue'), 'utf8')
    expect(page).toContain("useHudOverlayBackground(settings, 'sectors')")
    expect(page).toContain("panelBackgroundOpacity = computed(() => onTargetPage.value ? 1 : backgroundOpacity.value)")
    expect(page).toContain(":style=\"{ '--hud-sectors-bg-opacity': String(panelBackgroundOpacity) }\"")
    expect(page).toContain('background: rgba(13, 14, 18, var(--hud-sectors-bg-opacity, 1));')
    expect(page).not.toMatch(/\.hud-overlay__panel\s*\{[^}]*\bopacity:/)
  })
})
