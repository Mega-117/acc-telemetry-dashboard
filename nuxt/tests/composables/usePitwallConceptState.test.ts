import { ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

// `useState` di Nuxt e' un ref condiviso per chiave: qui se ne riproduce il
// contratto, senza montare Nuxt. Le chiavi si svuotano fra un test e l'altro,
// altrimenti uno stato sporco passerebbe al successivo.
const states = new Map<string, unknown>()
;(globalThis as unknown as { useState: unknown }).useState = <T>(key: string, init: () => T) => {
  if (!states.has(key)) states.set(key, ref(init()))
  return states.get(key)
}

import { usePitwallConceptState } from '~/composables/usePitwallConceptState'
import {
  PITWALL_CONCEPT_CURRENT_USER_ID,
  pitwallConceptAmInvited,
  pitwallConceptAmMember,
} from '~/utils/pitwallConcept'

function access(state: ReturnType<typeof usePitwallConceptState>, direction: 'assist' | 'assisted', personId: string) {
  return state.links.value[direction].find(link => link.personId === personId)?.access ?? null
}

describe('Pit Wall Concept: lo stato condiviso del prototipo', () => {
  let state: ReturnType<typeof usePitwallConceptState>

  beforeEach(() => {
    states.clear()
    state = usePitwallConceptState()
  })

  it('parte dalle fixture senza condividerne gli oggetti', () => {
    // Le fixture sono l'origine, non lo stato: mutare la copia non deve
    // sporcare il modulo, altrimenti il secondo test ripartirebbe storto.
    expect(access(state, 'assist', 'mario')).toBe('always')
    state.removeLink('assist', 'mario')
    expect(access(state, 'assist', 'mario')).toBeNull()

    states.clear()
    const fresh = usePitwallConceptState()
    expect(access(fresh, 'assist', 'mario')).toBe('always')
  })

  it('chiede, aspetta, e ritira senza lasciare tracce', () => {
    state.askToAssist('gallo')
    expect(access(state, 'assist', 'gallo')).toBe('pending')
    // Chiedere due volte non produce due righe.
    state.askToAssist('gallo')
    expect(state.links.value.assist.filter(link => link.personId === 'gallo')).toHaveLength(1)
    state.cancelRequest('gallo')
    expect(access(state, 'assist', 'gallo')).toBeNull()
  })

  it('risponde a chi ha chiesto, e la richiesta diventa un permesso vero', () => {
    expect(access(state, 'assisted', 'paolo')).toBe('incoming')
    state.decideRequest('paolo', 'today', '23:40')
    expect(access(state, 'assisted', 'paolo')).toBe('today')
    expect(state.links.value.assisted.find(link => link.personId === 'paolo')?.until).toBe('23:40')
    // A una richiesta si risponde una volta sola: da qui in poi quella riga e'
    // un permesso, e si cambia con gli strumenti dei permessi.
    state.decideRequest('paolo', 'always')
    expect(access(state, 'assisted', 'paolo')).toBe('today')
  })

  it('rifiutare toglie la riga, non la lascia in sospeso', () => {
    state.decideRequest('paolo', 'reject')
    expect(access(state, 'assisted', 'paolo')).toBeNull()
  })

  it('autorizza in anticipo, con o senza scadenza', () => {
    state.allowToAssistMe('gallo', 'always')
    expect(access(state, 'assisted', 'gallo')).toBe('always')
    state.allowToAssistMe('martina', 'today', '20:00')
    expect(state.links.value.assisted.find(link => link.personId === 'martina')?.until).toBe('20:00')
    state.setExpiry('assisted', 'martina', '23:40')
    expect(state.links.value.assisted.find(link => link.personId === 'martina')?.until).toBe('23:40')
    // Una scadenza non si appiccica a un permesso che vale sempre.
    state.setExpiry('assisted', 'gallo', '20:00')
    expect(state.links.value.assisted.find(link => link.personId === 'gallo')?.until).toBeUndefined()
  })

  it('entrare in una gara smette di essere invitati', () => {
    const invited = state.races.value[1]!
    expect(pitwallConceptAmInvited(invited)).toBe(true)
    state.enterRace(invited.id)
    expect(pitwallConceptAmMember(state.races.value[1]!)).toBe(true)
    expect(state.selectedRace.value?.id).toBe(invited.id)
  })

  it('uscire lascia la gara in piedi, e chi l ha aperta non puo uscirne', () => {
    const race = state.races.value[0]!
    state.leaveRace(race.id)
    expect(pitwallConceptAmMember(state.races.value[0]!)).toBe(false)
    expect(state.races.value[0]!.members.length).toBeGreaterThan(0)

    states.clear()
    const host = usePitwallConceptState()
    host.leaveRace('race-47', 'mario')
    expect(host.races.value[0]!.members.some(member => member.personId === 'mario')).toBe(true)
  })

  it('invita, promuove e toglie, ma mai chi ha aperto la gara', () => {
    const race = state.races.value[0]!
    state.inviteToRace(race.id, 'gallo')
    expect(state.races.value[0]!.members.find(member => member.personId === 'gallo')?.role).toBe('invited')
    // Chi e' gia' dentro non si invita una seconda volta.
    state.inviteToRace(race.id, 'gallo')
    expect(state.races.value[0]!.members.filter(member => member.personId === 'gallo')).toHaveLength(1)

    state.promoteInRace(race.id, 'luca')
    expect(state.races.value[0]!.members.find(member => member.personId === 'luca')?.role).toBe('manager')
    state.removeFromRace(race.id, 'luca')
    expect(state.races.value[0]!.members.some(member => member.personId === 'luca')).toBe(false)
    state.removeFromRace(race.id, 'mario')
    expect(state.races.value[0]!.members.some(member => member.personId === 'mario')).toBe(true)
  })

  it('chiudere una gara la lascia leggibile invece di cancellarla', () => {
    state.closeRace('race-47')
    expect(state.races.value[0]!.closed).toBe(true)
    expect(state.races.value[0]!.members.length).toBeGreaterThan(0)
  })

  it('accettare un avviso fa la cosa che l avviso prometteva', () => {
    // E' il difetto che questo store esiste per chiudere: prima accettare e
    // rifiutare toglievano soltanto la riga dalla campanella.
    expect(state.pendingNoticeCount.value).toBe(3)
    expect(access(state, 'assisted', 'paolo')).toBe('incoming')
    state.acceptNotice('req:paolo', 'always')
    expect(access(state, 'assisted', 'paolo')).toBe('always')
    expect(state.pendingNoticeCount.value).toBe(2)

    state.acceptNotice('inv:race-12')
    expect(pitwallConceptAmMember(state.races.value[1]!)).toBe(true)
    expect(state.pendingNoticeCount.value).toBe(1)

    state.dismissNotice('grant:mario')
    expect(state.pendingNoticeCount.value).toBe(0)
  })

  it('rifiutare una richiesta la toglie anche dall elenco, non solo dalla campanella', () => {
    // Campanella ed elenco sono due facce della stessa richiesta: rispondere da
    // una parte deve chiudere anche l'altra, altrimenti resta un fantasma.
    state.rejectNotice('req:paolo')
    expect(access(state, 'assisted', 'paolo')).toBeNull()
    expect(state.notices.value.some(notice => notice.id === 'req:paolo')).toBe(false)
  })

  it('non ripropone nella ricerca chi e gia in un elenco', () => {
    // La ricerca e' la stessa presa dello store vero: si scrive la query, il
    // risultato arriva quando c'e'. Nel mock arriva subito.
    const search = (query: string) => {
      state.searchQuery.value = query
      return state.found.value
    }
    // mario e marco stanno in un verso solo: restano proponibili per l'altro.
    const ids = (query: string) => search(query).entries.map(person => person.id).sort()
    expect(ids('mar')).toEqual(['gallo', 'marco', 'mario', 'martina'])
    state.askToAssist('gallo')
    const after = search('mar')
    // Un verso solo non basta a dire "ce l'hai gia'": gallo resta proponibile
    // per l'altro verso (e' il bottone del verso gia' presente a sparire).
    expect(ids('mar')).toEqual(['gallo', 'marco', 'mario', 'martina'])
    expect(after.linked).toEqual([])
    // Con entrambi i versi (luca sta in tutte e due le liste) passa fra quelli che ho gia'.
    const both = search('luc')
    expect(both.entries).toEqual([])
    expect(both.linked.map(person => person.id)).toEqual(['luca'])
    expect(search('').state).toBe('idle')
    // Me stesso non sono mai un risultato, ne' fra gli aggiungibili ne' fra i
    // collegati: non ci si autorizza da soli.
    const self = search(PITWALL_CONCEPT_CURRENT_USER_ID)
    expect(self.entries).toEqual([])
    expect(self.linked).toEqual([])
  })

  it('lo scenario affollato si accende e si spegne senza perdere il resto', () => {
    expect(state.crowded.value).toBe(false)
    state.toggleCrowded()
    expect(state.crowded.value).toBe(true)
    expect(state.links.value.assisted.length).toBeGreaterThan(8)
    // Tornare indietro rimette lo scenario che racconta, non uno stato ibrido.
    state.toggleCrowded()
    expect(state.crowded.value).toBe(false)
    expect(access(state, 'assisted', 'paolo')).toBe('incoming')
  })

  it('si riporta allo stato di partenza, per poterlo dimostrare due volte', () => {
    state.removeLink('assist', 'mario')
    state.closeRace('race-47')
    state.reset()
    expect(access(state, 'assist', 'mario')).toBe('always')
    expect(state.races.value[0]!.closed).toBe(false)
    expect(state.pendingNoticeCount.value).toBe(3)
  })

  it('espone anche la gara di chi guarda, che negli altri elenchi non c e', () => {
    // La presa e' una sola: se il mock non implementasse `myRoom`, la card
    // esisterebbe solo con dati veri e i test dei componenti - che girano sul
    // mock - non la vedrebbero mai.
    const mine = state.myRoom.value
    expect(mine).not.toBeNull()
    expect(mine!.state).toBe('live')
    // Chi guarda e' dentro la propria gara, e quella gara non compare fra le
    // persone in pista: quelle sono per definizione le altre.
    expect(mine!.members.some(member => member.personId === state.meId.value)).toBe(true)
    expect(state.races.value.some(race => race.id === mine!.id)).toBe(false)
  })
})
