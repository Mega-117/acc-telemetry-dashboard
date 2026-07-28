import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import SectorDeltaHud from '~/components/overlay/SectorDeltaHud.vue'
import type { SectorHudEntry, SectorHudState } from '~/composables/useLiveStatePoller'

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
    expect(html).toContain('ref best')
  })

  it('le checkbox di visibilità non cambiano il delta del giro precedente', async () => {
    const html = await renderHud({
      showBest: false,
      showReference: false,
      deltaReference: 'previousLap',
    })

    expect(html).not.toContain('sector-delta__best')
    expect(html).not.toContain('sector-delta__ref')
    expect(html).toContain('-0.200')
    expect(html).toContain('ref lap 2')
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

    expect(html).toContain('SECTORS · VS · LAST')
    expect(html).toContain('01:23.456')
    expect(html).toContain('CURRENT LAP')
    expect((html.match(/sector-compact__label/g) || []).length).toBe(3)
    expect(html).not.toContain('sector-delta__ref')
    expect(html).not.toContain('sector-delta__best')
    expect(html).not.toContain('sector-compact__number--updating')
    expect(html).toContain('52.655')
  })

  it('nasconde hero e CURRENT LAP senza rimuovere header o righe compatte', async () => {
    const html = await renderHud({
      variant: 'compact',
      showCurrentLap: false,
      compactDisplayLap: { timeMs: 83_456, valid: false },
    })

    expect(html).toContain('SECTORS · VS · LAST')
    expect(html).not.toContain('01:23.456')
    expect(html).not.toContain('CURRENT LAP')
    expect(html).not.toContain('sector-compact__lap--invalid')
    expect((html.match(/sector-compact__label/g) || []).length).toBe(3)

    const classic = await renderHud({ variant: 'classic', showCurrentLap: false })
    expect(classic).toContain('sector-delta-hud__grid')
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
        liveLapValid: true,
      }),
    }))
    const second = await renderToString(createSSRApp({
      render: () => h(SectorDeltaHud, {
        sectorHud: eventDrivenHud,
        variant: 'compact',
        liveRunning: true,
        liveCurrentLapTimeMs: 44_850,
        liveLapValid: false,
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

  it('usa il valore hero in hold senza fermare il tempo del settore attivo', async () => {
    const runningHud: SectorHudState = {
      ...sectorHud,
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
        liveLapValid: true,
        compactDisplayLap: { timeMs: 141_250, valid: false },
      }),
    }))

    expect(html).toContain('02:21.250')
    expect(html).toContain('3.618')
    expect(html).toContain('sector-compact__lap--invalid')
  })

  it('aggiorna la testata compatta dal riferimento delta selezionato', async () => {
    const previous = await renderHud({ variant: 'compact', deltaReference: 'previousLap' })
    const best = await renderHud({ variant: 'compact', deltaReference: 'bestSector' })

    expect(previous).toContain('SECTORS · VS · LAST')
    expect(best).toContain('SECTORS · VS · BEST')
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
        liveCurrentLapTimeMs: 2_921_192,
        liveLapValid: false,
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
    expect(outsideInvalid).toContain('sector-compact__lap--target-outside')
    expect(outsideInvalid).toContain('sector-compact__lap--invalid')
    expect(hidden).not.toContain('sector-compact__lap--target-inside')
    expect(hidden).not.toContain('CURRENT LAP')
  })

})
