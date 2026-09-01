import { describe, expect, it } from 'vitest'
import {
  PITWALL_CONCEPT_CREWS,
  PITWALL_CONCEPT_CREW_IMAGES,
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  PITWALL_CONCEPT_PEOPLE,
  PITWALL_CONCEPT_RECENTS,
  describePitwallConceptAccess,
  filterPitwallConceptPeople,
  filterPitwallConceptPeopleByNickname,
  findPitwallConceptPerson,
  getPitwallConceptCrewMembers,
  pitwallConceptNickname,
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
    expect(filterPitwallConceptPeople('')).toHaveLength(8)
  })

  it('filters invitations only by nickname and removes the display prefix', () => {
    expect(filterPitwallConceptPeopleByNickname('mario').map(person => person.id)).toEqual(['mario'])
    expect(filterPitwallConceptPeopleByNickname('@mario').map(person => person.id)).toEqual(['mario'])
    expect(filterPitwallConceptPeopleByNickname('Mario Rossi')).toEqual([])
    expect(pitwallConceptNickname(PITWALL_CONCEPT_PEOPLE[0]!)).toBe('mariorossi')
  })

  it('returns mock directory results without making an external request', () => {
    expect(findPitwallConceptPerson('marcog')).toMatchObject({
      handle: '@marcog',
      state: 'racing',
      access: 'none',
    })
    expect(findPitwallConceptPerson('utente che non esiste')).toBeNull()
  })

  it('keeps five recent connection ids without duplicating directory data', () => {
    expect(PITWALL_CONCEPT_RECENTS).toHaveLength(5)
    expect(PITWALL_CONCEPT_RECENTS.every(person => Object.keys(person).join() === 'id')).toBe(true)
  })

  it('exposes only permanent, temporary or absent access in the static directory', () => {
    expect(describePitwallConceptAccess('permanent')).toBe('Accesso permanente')
    expect(describePitwallConceptAccess('temporary')).toBe('Accesso temporaneo')
    expect(describePitwallConceptAccess('none')).toBeNull()
    expect(PITWALL_CONCEPT_RECENTS.every(recent =>
      PITWALL_CONCEPT_PEOPLE.some(person => person.id === recent.id),
    )).toBe(true)
  })

  it('keeps pressure controls deterministic and bounded', () => {
    expect(stepPitwallConceptPressure(PITWALL_CONCEPT_DEFAULT_PRESSURES.FL, 1)).toBe(25.1)
    expect(stepPitwallConceptPressure(35, 1)).toBe(35)
    expect(stepPitwallConceptPressure(20, -1)).toBe(20)
  })

  it('offers exactly six local Crew image presets', () => {
    expect(PITWALL_CONCEPT_CREW_IMAGES).toHaveLength(6)
    expect(new Set(PITWALL_CONCEPT_CREW_IMAGES.map(image => image.id)).size).toBe(6)
    expect(PITWALL_CONCEPT_CREW_IMAGES.every(image => image.src.startsWith('/images/pitwall-crews/'))).toBe(true)
    expect(PITWALL_CONCEPT_CREWS.every(crew => PITWALL_CONCEPT_CREW_IMAGES.some(image => image.id === crew.imageId))).toBe(true)
  })

  it('resolves each Crew roster from permanent local people without duplicating identity data', () => {
    for (const crew of PITWALL_CONCEPT_CREWS) {
      const members = getPitwallConceptCrewMembers(crew)
      expect(crew.description.length).toBeGreaterThan(0)
      expect(members.map(person => person.id)).toEqual(crew.memberIds)
      expect(members.every(person => person.access === 'permanent')).toBe(true)
    }
  })

  it('filters only inside the selected Crew roster', () => {
    const apex = PITWALL_CONCEPT_CREWS.find(crew => crew.id === 'apex')!
    const matches = filterPitwallConceptPeople('mario', getPitwallConceptCrewMembers(apex))
    expect(matches.map(person => person.id)).toEqual(['mario'])
    expect(matches.some(person => person.id === 'andrea')).toBe(false)
  })
})
