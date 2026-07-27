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
})
