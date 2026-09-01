export type PitwallConceptScreen = 'home' | 'crew-create-identity' | 'crew-create-people' | 'crew-detail' | 'live'
export type PitwallConceptLiveTab = 'timing' | 'track'
export type PitwallConceptAccess = 'permanent' | 'temporary' | 'none'

export interface PitwallConceptPerson {
  id: string
  name: string
  initials: string
  handle: string
  source: 'crew' | 'guest' | 'global'
  state: 'racing' | 'available' | 'offline' | 'invited'
  access: PitwallConceptAccess
  detail: string
}

export interface PitwallConceptCrew {
  id: string
  name: string
  description: string
  memberIds: string[]
  tone: 'green' | 'violet'
  imageId: string
}

export interface PitwallConceptRecent {
  id: string
}

export interface PitwallConceptCrewImage {
  id: string
  label: string
  src: string
}

export const PITWALL_CONCEPT_CREW_IMAGES: PitwallConceptCrewImage[] = [
  { id: 'apex-red', label: 'Apex Red', src: '/images/pitwall-crews/apex-red.svg' },
  { id: 'velocity-orange', label: 'Velocity', src: '/images/pitwall-crews/velocity-orange.svg' },
  { id: 'endurance-blue', label: 'Endurance', src: '/images/pitwall-crews/endurance-blue.svg' },
  { id: 'night-violet', label: 'Night Race', src: '/images/pitwall-crews/night-violet.svg' },
  { id: 'heritage-gold', label: 'Heritage', src: '/images/pitwall-crews/heritage-gold.svg' },
  { id: 'carbon-green', label: 'Carbon', src: '/images/pitwall-crews/carbon-green.svg' },
]

export const PITWALL_CONCEPT_PEOPLE: PitwallConceptPerson[] = [
  { id: 'mario', name: 'Mario Rossi', initials: 'MR', handle: '@mariorossi', source: 'crew', state: 'racing', access: 'permanent', detail: 'In gara · accesso già autorizzato' },
  { id: 'marco', name: 'Marco Marini', initials: 'MM', handle: '@marcom', source: 'crew', state: 'available', access: 'permanent', detail: 'Nessuna gara attiva' },
  { id: 'andrea', name: 'Andrea Verdi', initials: 'AV', handle: '@andreav', source: 'guest', state: 'racing', access: 'temporary', detail: 'In gara · accesso valido per questa gara' },
  { id: 'gallo', name: 'Marco Gallo', initials: 'MG', handle: '@marcog', source: 'global', state: 'racing', access: 'none', detail: 'Nessun accesso attivo' },
  { id: 'martina', name: 'Martina Conti', initials: 'MC', handle: '@martinac', source: 'global', state: 'available', access: 'none', detail: 'Nessun accesso attivo' },
  { id: 'luca', name: 'Luca Bianchi', initials: 'LB', handle: '@lucab', source: 'crew', state: 'available', access: 'permanent', detail: 'Nessuna gara attiva' },
  { id: 'enrico', name: 'Enrico Saiani', initials: 'ES', handle: '@enricos', source: 'crew', state: 'available', access: 'permanent', detail: 'Nessuna gara attiva' },
  { id: 'paolo', name: 'Paolo Verdi', initials: 'PV', handle: '@paolov', source: 'global', state: 'available', access: 'none', detail: 'Nessun accesso attivo' },
]

export const PITWALL_CONCEPT_CREWS: PitwallConceptCrew[] = [
  { id: 'apex', name: 'Apex One Racing', description: 'Endurance, campionato e allenamenti insieme', memberIds: ['mario', 'marco', 'luca', 'enrico'], tone: 'green', imageId: 'apex-red' },
  { id: 'endurance-x', name: 'Endurance X', description: 'Strategia, gare endurance e lavoro di squadra', memberIds: ['marco', 'luca', 'enrico'], tone: 'violet', imageId: 'night-violet' },
]

export const PITWALL_CONCEPT_RECENTS: PitwallConceptRecent[] = [
  { id: 'andrea' },
  { id: 'mario' },
  { id: 'gallo' },
  { id: 'martina' },
  { id: 'paolo' },
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

export function findPitwallConceptPerson(query: string, people = PITWALL_CONCEPT_PEOPLE): PitwallConceptPerson | null {
  return filterPitwallConceptPeople(query, people)[0] ?? null
}

export function getPitwallConceptCrewMembers(
  crew: PitwallConceptCrew,
  people = PITWALL_CONCEPT_PEOPLE,
): PitwallConceptPerson[] {
  const peopleById = new Map(people.map(person => [person.id, person]))
  return crew.memberIds.flatMap(id => {
    const person = peopleById.get(id)
    return person ? [person] : []
  })
}

export function describePitwallConceptAccess(access: PitwallConceptAccess): string | null {
  if (access === 'permanent') return 'Accesso permanente'
  if (access === 'temporary') return 'Accesso temporaneo'
  return null
}

export const PITWALL_CONCEPT_DEFAULT_PRESSURES = Object.freeze({ FL: 25, FR: 25, RL: 25, RR: 25 })

export function stepPitwallConceptPressure(value: number, direction: 1 | -1): number {
  return Math.round(Math.min(35, Math.max(20, value + direction * 0.1)) * 10) / 10
}
