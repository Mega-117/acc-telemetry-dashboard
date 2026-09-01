export type PitwallConceptScreen = 'home' | 'crew-create-identity' | 'crew-create-people' | 'crew-detail' | 'live'
export type PitwallConceptLiveTab = 'timing' | 'track'

export interface PitwallConceptPerson {
  id: string
  name: string
  initials: string
  handle?: string
  source: 'crew' | 'guest' | 'global'
  state: 'racing' | 'available' | 'offline' | 'invited'
  detail: string
}

export interface PitwallConceptCrew {
  id: string
  name: string
  members: number
  live: number
  tone: 'green' | 'violet'
}

export const PITWALL_CONCEPT_PEOPLE: PitwallConceptPerson[] = [
  { id: 'mario', name: 'Mario Rossi', initials: 'MR', source: 'crew', state: 'racing', detail: 'Ferrari 296 GT3 · Monza · P7 · Giro 18' },
  { id: 'marco', name: 'Marco Marini', initials: 'MM', source: 'crew', state: 'available', detail: 'Nessuna sessione attiva' },
  { id: 'andrea', name: 'Andrea Verdi', initials: 'AV', source: 'guest', state: 'racing', detail: 'McLaren 720S GT3 · Spa · P12 · Giro 9' },
  { id: 'gallo', name: 'Marco Gallo', initials: 'MG', handle: '@marcog', source: 'global', state: 'available', detail: 'Utente globale · nessuna Crew' },
  { id: 'martina', name: 'Martina Conti', initials: 'MC', handle: '@martinac', source: 'global', state: 'available', detail: 'Utente globale · nessuna Crew' },
  { id: 'luca', name: 'Luca Bianchi', initials: 'LB', handle: '@lucab', source: 'crew', state: 'available', detail: 'Membro Apex One Racing' },
  { id: 'paolo', name: 'Paolo Verdi', initials: 'PV', handle: '@paolov', source: 'global', state: 'available', detail: 'Utente globale' },
]

export const PITWALL_CONCEPT_CREWS: PitwallConceptCrew[] = [
  { id: 'apex', name: 'Apex One Racing', members: 4, live: 1, tone: 'green' },
  { id: 'endurance-x', name: 'Endurance X', members: 3, live: 0, tone: 'violet' },
]

export function filterPitwallConceptPeople(query: string, people = PITWALL_CONCEPT_PEOPLE): PitwallConceptPerson[] {
  const needle = query.trim().toLocaleLowerCase('it-IT')
  if (!needle) return people
  return people.filter(person => `${person.name} ${person.handle ?? ''}`.toLocaleLowerCase('it-IT').includes(needle))
}

export function splitPitwallConceptSearch(query: string) {
  const results = filterPitwallConceptPeople(query)
  return {
    known: results.filter(person => person.source !== 'global'),
    global: results.filter(person => person.source === 'global'),
  }
}

export const PITWALL_CONCEPT_DEFAULT_PRESSURES = Object.freeze({ FL: 25, FR: 25, RL: 25, RR: 25 })

export function stepPitwallConceptPressure(value: number, direction: 1 | -1): number {
  return Math.round(Math.min(35, Math.max(20, value + direction * 0.1)) * 10) / 10
}
