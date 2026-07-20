/**
 * Giro virtuale REALE (PIP-256/257): il controller coach viene guidato con le
 * posizioni vere del giro 296 a Spa (2:15.965) campionate a 250ms, la stessa
 * cadenza del poller FE. Due giri completi: l'esito post-curva deve suonare
 * esattamente una volta per giro, subito dopo l'apex della curva-focus, e il
 * catalogo frasi deve coprire ogni combinazione del motore con testi >=3
 * parole (regola Kokoro).
 */
import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/spa_296_lap_positions.json'
import coachScript from '../../app/config/coachVoiceScript.json'
import {
  POST_CORNER_OFFSET,
  advancePostCorner,
  coachPhraseKey,
  createPostCornerState,
  type CoachFocus,
  type CoachPhraseKey,
} from '~/services/spotter/coachVoiceController'

// Bruxelles: apex reale ~3040m su ~6960m -> ~0.437 normalizzato
const FOCUS_BRUXELLES: CoachFocus = {
  cornerId: 3,
  cornerName: 'Bruxelles',
  apexNormPos: 0.437,
  metric: 'brake_point',
  direction: 'later',
  magnitude: 25,
  timeLostS: 0.14,
}

describe('giro virtuale reale a Spa (posizioni vere a 250ms)', () => {
  const positions = fixture.positions as number[]

  it('la fixture e" un giro vero: parte dalla linea e copre tutta la pista', () => {
    expect(positions.length).toBeGreaterThan(500)
    expect(positions[0]).toBeLessThan(0.01)
    expect(Math.max(...positions)).toBeGreaterThan(0.98)
    // monotona non decrescente (nessun teletrasporto nel giro)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]!)
    }
  })

  it('esito post-curva: esattamente uno per giro, subito dopo la curva-focus', () => {
    let state = createPostCornerState()
    const heard: { lap: number, position: number }[] = []
    for (let lap = 0; lap < 2; lap++) {
      for (const position of positions) {
        const step = advancePostCorner(state, {
          position,
          focus: FOCUS_BRUXELLES,
          outcome: 'improved',
          voice: 'im_nicola',
        })
        state = step.state
        if (step.path) heard.push({ lap, position })
      }
    }
    expect(heard).toHaveLength(2)
    expect(heard[0]?.lap).toBe(0)
    expect(heard[1]?.lap).toBe(1)
    const trigger = FOCUS_BRUXELLES.apexNormPos + POST_CORNER_OFFSET
    for (const event of heard) {
      // suona entro pochi metri dal punto d'uscita previsto
      expect(event.position).toBeGreaterThanOrEqual(trigger)
      expect(event.position).toBeLessThan(trigger + 0.01)
    }
  })

  it('il catalogo frasi copre ogni combinazione possibile del motore', () => {
    const catalog = new Set((coachScript.phrases as { key: string }[]).map(p => p.key))
    const combos: CoachPhraseKey[] = []
    const directionsByMetric = {
      brake_point: ['later', 'earlier'],
      vmin: ['faster', 'slower'],
      throttle: ['earlier', 'later'],
    } as const
    for (const metric of Object.keys(directionsByMetric) as (keyof typeof directionsByMetric)[]) {
      for (const direction of directionsByMetric[metric]) {
        for (const magnitude of [1, 1000]) {
          combos.push(coachPhraseKey({
            cornerId: 1, apexNormPos: 0.5, metric, direction, magnitude, timeLostS: 0.1,
          } as CoachFocus))
        }
      }
    }
    for (const outcome of ['improved', 'ok', 'worse']) combos.push(`outcome_${outcome}` as CoachPhraseKey)
    for (const key of combos) {
      expect(catalog.has(key), `manca la frase per ${key}`).toBe(true)
    }
    // regola Kokoro: ogni frase almeno 3 parole
    for (const phrase of coachScript.phrases as { key: string, text: string }[]) {
      const words = phrase.text.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
      expect(words.length, `frase corta: ${phrase.key}`).toBeGreaterThanOrEqual(3)
    }
  })
})
