import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import TyreRaceHud from '~/components/overlay/TyreRaceHud.vue'
import DamageRaceHud from '~/components/overlay/DamageRaceHud.vue'

function fastState() {
  const ids = ['FL', 'FR', 'RL', 'RR'] as const
  return {
    isFresh: true, isLive: true, isEngineRunning: true, pitLimiterOn: false,
    rainIntensity: 0, rainIntensity10Min: 1, rainIntensity30Min: 3,
    tyreCompound: 'DRY', tyreSetAvailable: true, currentTyreSet: 2,
    lapPressureAverage: { status: 'available', tyreSet: 2, values: { FL: 23.1, FR: 23.1, RL: 23.1, RR: 23.1 } },
    tyres: ids.map((id, index) => ({
      id, pressurePsi: 23.2 + index / 10, pressureLossPsi: index === 0 ? .18 : 0,
      coreTempC: 76 + index, wheelSlipScaled: 3 + index * 3, slipBand: index === 0 ? 'red' : 'white',
      slipState: 'ok', wheelSlip: 1, slipRatio: 0, brakeTempC: 568 - index * 10,
      brakeCompound: index < 2 ? 1 : 2, padLifePct: 92 - index, discLifePct: 99,
    })),
    damage: {
      body: {
        front: { percentage: 24, repairTimeMs: 6780 }, rear: { percentage: 21, repairTimeMs: 2400 },
        left: { percentage: 0, repairTimeMs: 0 }, right: { percentage: 68, repairTimeMs: 7800 },
        repairTimeMs: 16980,
      },
      suspension: {
        FL: { percentage: 16 }, FR: { percentage: 28 }, RL: { percentage: 7 }, RR: { percentage: 19 },
        repairTimeMs: 12800,
      },
      totalRepairTimeMs: 29780,
    },
  }
}

describe('Race HUD components', () => {
  it('rende la gerarchia gomme specchiata con slip, loss e freni', async () => {
    const html = await renderToString(createSSRApp(TyreRaceHud, { fastState: fastState() }))
    expect(html).toContain('23.2')
    expect(html).toContain('AVG 23.1')
    expect(html).toContain('LOSS 0.18')
    expect(html).toContain('FRONT')
    expect(html).toContain('REAR')
    expect(html).toContain('DRY 2')
    expect(html.match(/tyre-race__corner--rear/g)).toHaveLength(2)
    expect(html.match(/role=/g) ?? []).toHaveLength(0)
  })

  it('rende sagoma GT3, quattro body zone, sospensioni e totali', async () => {
    const html = await renderToString(createSSRApp(DamageRaceHud, { fastState: fastState() }))
    expect(html).toContain('Sagoma GT3')
    expect(html).toContain('SUSPENSION')
    expect(html).toContain('TOTAL')
    expect(html).toContain('0:07.80')
    for (const label of ['FL', 'FR', 'RL', 'RR', '24%', '68%']) expect(html).toContain(label)
  })
})
