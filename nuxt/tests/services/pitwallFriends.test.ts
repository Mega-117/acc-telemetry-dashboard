import { describe, expect, it } from 'vitest'
import {
  derivePitwallFriends,
  friendUidsFromGrants,
  pitwallFriendActions,
  sortPitwallFriends,
} from '~/services/pitwall/pitwallFriends'
import type { PitwallGrant, PitwallGrantStatus } from '~/services/pitwall/pitwallLink'
import type { PitwallIncomingRequest, PitwallOutgoingLink } from '~/services/pitwall/pitwallEngineerService'

const ME = 'me'
const NOW_MS = Date.parse('2026-09-04T10:00:00.000Z')

/** `me__X`: io autorizzo X. Vista come richiesta ricevuta. */
function mine(uid: string, status: PitwallGrantStatus, expiresAtMs: number | null = null): PitwallIncomingRequest {
  return {
    engineerUid: uid,
    nickname: `nick-${uid}`,
    status,
    createdAt: '2026-09-01T00:00:00.000Z',
    scope: status === 'granted' ? (expiresAtMs == null ? 'always' : 'once') : null,
    expiresAtMs,
    requestedScope: 'always',
  }
}

/** `X__me`: X autorizza me. Vista come collegamento in uscita. */
function theirs(uid: string, status: PitwallGrantStatus, expiresAtMs: number | null = null): PitwallOutgoingLink {
  const usable = status === 'granted' && (expiresAtMs == null || expiresAtMs > NOW_MS)
  return {
    driverUid: uid,
    nickname: `nick-${uid}`,
    status,
    scope: status === 'granted' ? (expiresAtMs == null ? 'always' : 'once') : null,
    expiresAtMs,
    requestedScope: 'always',
    usable,
    session: null,
    reachable: false,
  }
}

function grant(driverUid: string, engineerUid: string, status: PitwallGrantStatus, expiresAtMs: number | null = null): PitwallGrant {
  return {
    schemaVersion: 1,
    driverUid,
    engineerUid,
    status,
    createdBy: engineerUid,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    scope: status === 'granted' ? (expiresAtMs == null ? 'always' : 'once') : null,
    expiresAtMs,
  }
}

function stateOf(incoming: PitwallIncomingRequest[], outgoing: PitwallOutgoingLink[]) {
  return derivePitwallFriends(incoming, outgoing, NOW_MS).map(view => [view.personId, view.state])
}

describe('lo stato letto dall utente, dai due versi del permesso', () => {
  it('amici quando ciascuno ha autorizzato l altro', () => {
    expect(stateOf([mine('x', 'granted')], [theirs('x', 'granted')])).toEqual([['x', 'friends']])
  })

  it('richiesta inviata quando ho autorizzato io e X non ha ancora risposto', () => {
    expect(stateOf([mine('x', 'granted')], [])).toEqual([['x', 'sent']])
    expect(stateOf([mine('x', 'granted')], [theirs('x', 'pending')])).toEqual([['x', 'sent']])
  })

  it('richiesta inviata anche con la sola domanda in attesa dall altra parte (legacy: chiedi di assisterlo)', () => {
    expect(stateOf([], [theirs('x', 'pending')])).toEqual([['x', 'sent']])
  })

  it('richiesta ricevuta quando X mi ha autorizzato e io no (legacy: puo assistermi a un verso solo)', () => {
    expect(stateOf([], [theirs('x', 'granted')])).toEqual([['x', 'received']])
  })

  it('richiesta ricevuta quando X me l ha chiesto, anche se nessuno ha ancora concesso niente', () => {
    expect(stateOf([mine('x', 'pending')], [])).toEqual([['x', 'received']])
    // Entrambi in attesa: tocca a me decidere, quindi vince "ricevuta".
    expect(stateOf([mine('x', 'pending')], [theirs('x', 'pending')])).toEqual([['x', 'received']])
  })

  it('una relazione revocata da entrambe le parti non compare', () => {
    expect(stateOf([mine('x', 'revoked')], [theirs('x', 'revoked')])).toEqual([])
    expect(stateOf([mine('x', 'revoked')], [])).toEqual([])
  })

  it('un "solo per oggi" scaduto vale come assente: si torna a richiesta ricevuta o inviata', () => {
    const expired = NOW_MS - 1
    const valid = NOW_MS + 60_000
    expect(stateOf([mine('x', 'granted', expired)], [theirs('x', 'granted')])).toEqual([['x', 'received']])
    expect(stateOf([mine('x', 'granted')], [theirs('x', 'granted', expired)])).toEqual([['x', 'sent']])
    expect(stateOf([mine('x', 'granted', valid)], [theirs('x', 'granted', valid)])).toEqual([['x', 'friends']])
  })

  it('porta il soprannome e gli stati grezzi dei due documenti', () => {
    const [view] = derivePitwallFriends([mine('x', 'pending')], [theirs('x', 'granted')], NOW_MS)
    expect(view).toMatchObject({
      personId: 'x',
      nickname: 'nick-x',
      iAllow: false,
      theyAllow: true,
      mineStatus: 'pending',
      theirsStatus: 'granted',
    })
  })

  it('una persona per riga, anche con documenti su entrambi i versi', () => {
    const views = derivePitwallFriends(
      [mine('a', 'granted'), mine('b', 'pending')],
      [theirs('a', 'granted'), theirs('c', 'granted')],
      NOW_MS
    )
    expect(views.map(view => view.personId).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('gli amici dai documenti grezzi: l intersezione, non l unione', () => {
  it('conta solo chi e concesso in entrambi i versi', () => {
    const asDriver = [grant(ME, 'a', 'granted'), grant(ME, 'b', 'granted'), grant(ME, 'c', 'pending')]
    const asEngineer = [grant('a', ME, 'granted'), grant('c', ME, 'granted'), grant('d', ME, 'granted')]
    expect(friendUidsFromGrants(asDriver, asEngineer, ME, NOW_MS)).toEqual(['a'])
  })

  it('uno scaduto o revocato rompe l intersezione', () => {
    const asDriver = [grant(ME, 'a', 'granted', NOW_MS - 1), grant(ME, 'b', 'revoked')]
    const asEngineer = [grant('a', ME, 'granted'), grant('b', ME, 'granted')]
    expect(friendUidsFromGrants(asDriver, asEngineer, ME, NOW_MS)).toEqual([])
  })

  it('ignora i documenti che non riguardano me e non restituisce me stesso', () => {
    const asDriver = [grant('altro', 'a', 'granted'), grant(ME, ME, 'granted')]
    const asEngineer = [grant('a', 'altro', 'granted'), grant(ME, ME, 'granted')]
    expect(friendUidsFromGrants(asDriver, asEngineer, ME, NOW_MS)).toEqual([])
  })
})

describe('cosa scrivere per sciogliere la relazione', () => {
  it('tocca solo i documenti che esistono e non sono gia revocati', () => {
    const [both] = derivePitwallFriends([mine('x', 'granted')], [theirs('x', 'granted')], NOW_MS)
    expect(pitwallFriendActions(both)).toEqual({ revokeMine: true, withdrawTheirs: true })

    const [onlyMine] = derivePitwallFriends([mine('x', 'granted')], [], NOW_MS)
    expect(pitwallFriendActions(onlyMine)).toEqual({ revokeMine: true, withdrawTheirs: false })

    const [pendingTheirs] = derivePitwallFriends([mine('x', 'revoked')], [theirs('x', 'pending')], NOW_MS)
    expect(pitwallFriendActions(pendingTheirs)).toEqual({ revokeMine: false, withdrawTheirs: true })
  })

  it('senza vista non c e niente da scrivere', () => {
    expect(pitwallFriendActions(null)).toEqual({ revokeMine: false, withdrawTheirs: false })
  })
})

describe('ordine di lettura', () => {
  it('prima chi aspetta una mia decisione, poi le mie richieste, poi gli amici; in pista davanti, poi alfabetico', () => {
    const views = derivePitwallFriends(
      [mine('zeta', 'granted'), mine('alfa', 'granted'), mine('beta', 'granted'), mine('delta', 'pending')],
      [theirs('zeta', 'granted'), theirs('alfa', 'granted'), theirs('gamma', 'pending')],
      NOW_MS
    )
    const sorted = sortPitwallFriends(views, id => id === 'zeta')
    expect(sorted.map(view => view.personId)).toEqual(['delta', 'beta', 'gamma', 'zeta', 'alfa'])
  })
})
