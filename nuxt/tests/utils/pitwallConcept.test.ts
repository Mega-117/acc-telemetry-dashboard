import { describe, expect, it } from 'vitest'
import {
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  filterPitwallConceptPeople,
  splitPitwallConceptSearch,
  stepPitwallConceptPressure,
} from '~/utils/pitwallConcept'

describe('Pitwall Concept mock model', () => {
  it('filters known and global people without reading a service', () => {
    const matches = splitPitwallConceptSearch('mar')
    expect(matches.known.map(person => person.name)).toEqual(['Mario Rossi', 'Marco Marini'])
    expect(matches.global.map(person => person.name)).toEqual(['Marco Gallo', 'Martina Conti'])
  })

  it('returns every fixture for an empty query', () => {
    expect(filterPitwallConceptPeople('')).toHaveLength(7)
  })

  it('keeps pressure controls deterministic and bounded', () => {
    expect(stepPitwallConceptPressure(PITWALL_CONCEPT_DEFAULT_PRESSURES.FL, 1)).toBe(25.1)
    expect(stepPitwallConceptPressure(35, 1)).toBe(35)
    expect(stepPitwallConceptPressure(20, -1)).toBe(20)
  })
})
