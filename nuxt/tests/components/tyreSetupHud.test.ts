import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import TyreAdvancedHud from '~/components/overlay/TyreAdvancedHud.vue'
import { emptyTyreSetupViewModel } from '~/services/overlay/tyreSetupViewModel'

function setupModel() {
  return {
    ...emptyTyreSetupViewModel(),
    status: 'available' as const,
    currentTyreSet: 3,
    compound: 'DRY' as const,
    lastLap: {
      lap: 7,
      tyreSet: 3,
      compound: 'DRY' as const,
      pressure: {
        high: { FL: 27.1, FR: 27.3, RL: 27.1, RR: 27.3 },
        avg: { FL: 26.8, FR: 26.9, RL: 27.0, RR: 27.1 },
      },
      tyreTemperature: {
        high: { FL: 93, FR: 93, RL: 93, RR: 93 },
        avg: { FL: 90, FR: 89, RL: 92, RR: 90 },
        low: { FL: 88, FR: 85, RL: 91, RR: 88 },
      },
      brakeTemperature: {
        high: { FL: 765, FR: 755, RL: 615, RR: 611 },
        avg: { FL: 554, FR: 548, RL: 477, RR: 474 },
        low: { FL: 336, FR: 334, RL: 337, RR: 335 },
      },
      brakeCompounds: { FL: 1, FR: 1, RL: 2, RR: 2 },
    },
    totalPressureLoss: { FL: 0, FR: 0, RL: 0, RR: 0 },
    startingPressure: {
      status: 'available' as const,
      source: 'mfd_applied' as const,
      tyreSet: 3,
      values: { FL: 26.1, FR: 26.2, RL: 26.3, RR: 26.4 },
    },
  }
}

describe('TyreSetupHud', () => {
  it('rende le tre colonne, le finestre temporali e la pressione impostata', async () => {
    const app = createSSRApp(TyreAdvancedHud, {
      page: 'setup',
      fastState: {
        tyreSetup: setupModel(),
        tyres: [],
      },
    })

    const html = await renderToString(app)

    expect(html).toContain('TYRE PRESSURE')
    expect(html).toContain('TYRE TEMPS')
    expect(html).toContain('BRAKE TEMPS')
    expect(html).toContain('TOTAL LOSS')
    expect(html).toContain('RUN START · SET VALUE')
    expect(html).toContain('26.1')
    expect(html).not.toContain('click')
    expect(html).not.toContain('27.0 psi')
  })

  it('mostra uno stato nessun dato finche non esiste un giro valido', async () => {
    const app = createSSRApp(TyreAdvancedHud, {
      page: 'setup',
      fastState: {
        tyreSetup: emptyTyreSetupViewModel(),
        tyres: [],
      },
    })

    const html = await renderToString(app)
    expect(html).toContain('NESSUN DATO')
    expect(html).toContain('Completa un giro valido')
    expect(html).not.toContain('START PRESSURE')
  })
})
