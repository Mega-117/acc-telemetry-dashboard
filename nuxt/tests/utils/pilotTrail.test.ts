// PIP-637: percorso unico nella vista admin/coach di un pilota.
import { describe, expect, it } from 'vitest'
import { pilotTrail } from '~/utils/pilotTrail'
import { setLocale } from '~/i18n'

setLocale('it')

describe('pilotTrail', () => {
  it('ends on the open tab when no page is open', () => {
    expect(pilotTrail({ pilotName: 'Enrico Saiani', tabLabel: 'SESSIONI', detail: 'none', trackName: null })).toEqual([
      { label: 'Piloti', target: 'pilots' }, { label: 'Enrico Saiani', target: 'pilot' }, { label: 'Sessioni', target: null },
    ])
  })

  it('adds the open page after the tab, the tab becoming a way back', () => {
    const trail = pilotTrail({ pilotName: 'Enrico Saiani', tabLabel: 'PISTE', detail: 'track', trackName: 'Hungaroring' })
    expect(trail.slice(2)).toEqual([{ label: 'Piste', target: 'tab' }, { label: 'Hungaroring', target: null }])
    expect(pilotTrail({ pilotName: 'X', tabLabel: 'PANORAMICA', detail: 'session', trackName: null }).at(-1)!.label).toBe('Sessione')
    expect(pilotTrail({ pilotName: 'X', tabLabel: 'PANORAMICA', detail: 'stats', trackName: null }).at(-1)!.label).toBe('Statistiche')
    expect(pilotTrail({ pilotName: 'X', tabLabel: 'PISTE', detail: 'track', trackName: null }).at(-1)!.label).toBe('Pista')
  })
})
