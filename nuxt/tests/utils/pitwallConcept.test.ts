import { describe, expect, it } from 'vitest'
import {
  PITWALL_CONCEPT_CURRENT_USER_ID,
  PITWALL_CONCEPT_DEFAULT_EXPIRY,
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  PITWALL_CONCEPT_EXPIRY_PRESETS,
  PITWALL_CONCEPT_LINKS_ASSIST,
  PITWALL_CONCEPT_LINKS_ASSISTED,
  PITWALL_CONCEPT_PEOPLE,
  PITWALL_CONCEPT_RACES,
  describePitwallConceptAccess,
  filterPitwallConceptPeople,
  getPitwallConceptLinks,
  getPitwallConceptPerson,
  normalizePitwallConceptExpiry,
  pitwallConceptInitials,
  pitwallConceptInitialsById,
  pitwallConceptNickname,
  pitwallConceptNicknameById,
  searchPitwallConceptDirectory,
  stepPitwallConceptPressure,
} from '~/utils/pitwallConcept'

describe('Pitwall Concept mock model', () => {
  it('conosce le persone solo per nickname, mai per nome e cognome', () => {
    expect(getPitwallConceptPerson('mario')).toEqual({ id: 'mario', handle: '@mariorossi' })
    expect(getPitwallConceptPerson('chi-non-esiste')).toBeNull()
    expect(pitwallConceptNickname(PITWALL_CONCEPT_PEOPLE[1]!)).toBe('mariorossi')
    expect(pitwallConceptNicknameById('mario')).toBe('mariorossi')
    // Un id sconosciuto non deve stampare "undefined" a schermo.
    expect(pitwallConceptNicknameById('chi-non-esiste')).toBe('chi-non-esiste')
    expect(PITWALL_CONCEPT_PEOPLE.every(person => !('name' in person))).toBe(true)
  })

  it('ricava le iniziali dal nickname e le tiene distinguibili', () => {
    expect(pitwallConceptInitialsById('mario')).toBe('MI')
    expect(pitwallConceptInitialsById('gallo')).toBe('MG')
    expect(pitwallConceptInitialsById('martina')).toBe('MC')
    expect(pitwallConceptInitialsById('chi-non-esiste')).toBe('??')
    // Un nickname di una lettera sola non deve produrre una sigla vuota.
    expect(pitwallConceptInitials({ id: 'x', handle: '@x' })).toBe('XX')
    expect(pitwallConceptInitials({ id: 'vuoto', handle: '@' })).toBe('??')
    // Nessuna sigla ripetuta fra le persone del prototipo.
    const initials = PITWALL_CONCEPT_PEOPLE.map(pitwallConceptInitials)
    expect(new Set(initials).size).toBe(initials.length)
  })

  it('parla di durata e mai del gergo interno del permesso', () => {
    expect(describePitwallConceptAccess({ personId: 'mario', access: 'always' })).toBe('Sempre')
    expect(describePitwallConceptAccess({ personId: 'andrea', access: 'today', until: '23:40' }))
      .toBe('Fino alle 23:40')
    // Una scadenza mancante non deve produrre "Fino alle undefined".
    expect(describePitwallConceptAccess({ personId: 'andrea', access: 'today' })).toBe('Fino alle 00:00')
  })

  it('accetta solo orari di scadenza validi', () => {
    expect(normalizePitwallConceptExpiry('9:05')).toBe('09:05')
    expect(normalizePitwallConceptExpiry(' 23:40 ')).toBe('23:40')
    expect(normalizePitwallConceptExpiry('00:00')).toBe('00:00')
    expect(normalizePitwallConceptExpiry('25:00')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    expect(normalizePitwallConceptExpiry('12:75')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    expect(normalizePitwallConceptExpiry('mezzanotte')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    expect(normalizePitwallConceptExpiry('')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    // Le proposte rapide devono essere orari che il normalizzatore accetta.
    for (const preset of PITWALL_CONCEPT_EXPIRY_PRESETS) {
      expect(normalizePitwallConceptExpiry(preset)).toBe(preset)
    }
  })

  it('tiene i due versi separati e coerenti con la directory', () => {
    expect(getPitwallConceptLinks('assist')).toBe(PITWALL_CONCEPT_LINKS_ASSIST)
    expect(getPitwallConceptLinks('assisted')).toBe(PITWALL_CONCEPT_LINKS_ASSISTED)
    for (const link of [...PITWALL_CONCEPT_LINKS_ASSIST, ...PITWALL_CONCEPT_LINKS_ASSISTED]) {
      expect(getPitwallConceptPerson(link.personId)).not.toBeNull()
      if (link.access === 'today') expect(normalizePitwallConceptExpiry(link.until ?? '')).toBe(link.until)
    }
  })

  it('filtra per nickname, con o senza chiocciola', () => {
    expect(filterPitwallConceptPeople('mar').map(person => person.id))
      .toEqual(['mario', 'marco', 'gallo', 'martina'])
    expect(filterPitwallConceptPeople('@lucab').map(person => person.id)).toEqual(['luca'])
    expect(filterPitwallConceptPeople('')).toHaveLength(PITWALL_CONCEPT_PEOPLE.length)
  })

  it('propone solo persone non ancora collegate, e niente a query vuota', () => {
    expect(searchPitwallConceptDirectory('')).toEqual([])
    expect(searchPitwallConceptDirectory('  ')).toEqual([])
    // "mariorossi" e' gia' fra chi posso assistere: non deve ricomparire come nuovo.
    expect(searchPitwallConceptDirectory('mar').map(person => person.id)).toEqual(['gallo', 'martina'])
    expect(searchPitwallConceptDirectory('enricos')).toEqual([])
    expect(searchPitwallConceptDirectory('nessuno')).toEqual([])
  })

  it('descrive una gara viva con pilota e muretto presi dalla directory', () => {
    const race = PITWALL_CONCEPT_RACES[0]!
    expect(getPitwallConceptPerson(race.driverId)).not.toBeNull()
    expect(getPitwallConceptPerson(race.reasonPersonId)).not.toBeNull()
    expect(race.wallIds.every(id => getPitwallConceptPerson(id) !== null)).toBe(true)
    expect(race.driverId).not.toBe(PITWALL_CONCEPT_CURRENT_USER_ID)
  })

  it('mantiene i comandi pressione deterministici e limitati', () => {
    expect(stepPitwallConceptPressure(PITWALL_CONCEPT_DEFAULT_PRESSURES.FL, 1)).toBe(25.1)
    expect(stepPitwallConceptPressure(35, 1)).toBe(35)
    expect(stepPitwallConceptPressure(20, -1)).toBe(20)
  })
})
