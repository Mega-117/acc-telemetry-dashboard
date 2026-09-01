import { describe, expect, it } from 'vitest'
import {
  PITWALL_MEMBER_FRESH_MS,
  PITWALL_ORDER_TTL_MS,
  PITWALL_ROOM_SCHEMA_VERSION,
  buildPitwallRoomOrder,
  describePitwallRoom,
  describePitwallRoomExecutor,
  isPitwallClaimAvailable,
  isPitwallMemberFresh,
  isPitwallRoomInvited,
  isPitwallRoomMember,
  isPitwallRoomOrderExpired,
  pitwallRoomRoleOf,
  resolvePitwallRoomExecutor,
  type PitwallRoomMember
} from '~/services/pitwall/pitwallRoomContract'

const NOW_MS = Date.parse('2026-09-01T15:00:00.000Z')

function member(uid: string, driving: boolean, ageMs = 0): PitwallRoomMember {
  return {
    uid,
    nickname: uid.toUpperCase(),
    kind: 'driver',
    driving,
    runtimeSessionId: `rt-${uid}`,
    updatedAtMs: NOW_MS - ageMs
  }
}

function room(overrides: Record<string, unknown> = {}) {
  return {
    managerUids: ['rico'],
    memberUids: ['rico', 'popo'],
    allowedUids: ['gilles'],
    ...overrides
  } as Parameters<typeof pitwallRoomRoleOf>[0]
}

describe('due soli livelli di accesso, e nessuno dei due e "chi applica"', () => {
  it('manager, membro ed estraneo si distinguono', () => {
    expect(pitwallRoomRoleOf(room(), 'rico')).toBe('manager')
    expect(pitwallRoomRoleOf(room(), 'popo')).toBe('member')
    expect(pitwallRoomRoleOf(room(), 'sconosciuto')).toBeNull()
  })

  it('essere invitati non e essere dentro', () => {
    expect(isPitwallRoomInvited(room(), 'gilles')).toBe(true)
    expect(isPitwallRoomMember(room(), 'gilles')).toBe(false)
    expect(isPitwallRoomInvited(room({ memberUids: ['rico', 'gilles'] }), 'gilles')).toBe(false)
  })

  it('senza stanza o senza account non si inventa un ruolo', () => {
    expect(pitwallRoomRoleOf(null, 'rico')).toBeNull()
    expect(pitwallRoomRoleOf(room(), null)).toBeNull()
  })
})

describe('chi esegue l ordine e chi guida adesso', () => {
  it('con un solo pilota al volante lo indica senza esitare', () => {
    const resolution = resolvePitwallRoomExecutor([member('rico', true), member('popo', false)], NOW_MS)
    expect(resolution.reason).toBe('ready')
    expect(resolution.executor?.uid).toBe('rico')
    expect(describePitwallRoomExecutor(resolution)).toContain('RICO')
  })

  it('il cambio pilota si risolve da se: chi guida adesso esegue', () => {
    // Rico scende, Pippo sale: nessuno tocca niente lato ingegnere. E' il
    // motivo per cui la stanza esiste al posto del collegamento a una persona.
    const prima = resolvePitwallRoomExecutor([member('rico', true), member('pippo', false)], NOW_MS)
    const dopo = resolvePitwallRoomExecutor([member('rico', false), member('pippo', true)], NOW_MS)
    expect(prima.executor?.uid).toBe('rico')
    expect(dopo.executor?.uid).toBe('pippo')
  })

  it('chi ha spento il PC resta nella stanza ma non esegue piu', () => {
    const resolution = resolvePitwallRoomExecutor([member('rico', true, 5 * 60_000)], NOW_MS)
    expect(resolution.reason).toBe('nobody-driving')
    expect(resolution.executor).toBeNull()
  })

  it('due che si dichiarano al volante fermano l ordine, senza indovinare', () => {
    const resolution = resolvePitwallRoomExecutor([member('rico', true), member('pippo', true)], NOW_MS)
    expect(resolution.reason).toBe('multiple-driving')
    expect(resolution.executor).toBeNull()
    expect(resolution.conflicting.map(m => m.uid)).toEqual(['rico', 'pippo'])
    expect(describePitwallRoomExecutor(resolution)).toContain('RICO')
  })

  it('una stanza vuota si distingue da una stanza senza nessuno al volante', () => {
    expect(resolvePitwallRoomExecutor([], NOW_MS).reason).toBe('empty-room')
    expect(resolvePitwallRoomExecutor(null, NOW_MS).reason).toBe('empty-room')
    expect(resolvePitwallRoomExecutor([member('popo', false)], NOW_MS).reason).toBe('nobody-driving')
  })

  it('un battito senza ora dal server non conta come fresco', () => {
    // `serverTimestamp()` appena scritto arriva a zero finche' il server non
    // risponde: si sceglie la prudenza, non l ottimismo.
    const senzaOra = { ...member('rico', true), updatedAtMs: 0 }
    expect(resolvePitwallRoomExecutor([senzaOra], NOW_MS).reason).toBe('nobody-driving')
    expect(isPitwallMemberFresh(senzaOra, NOW_MS)).toBe(false)
  })

  it('presenza e volante sono due domande diverse', () => {
    // Un ingegnere al muretto e' presente e non guidera' mai; un pilota fermo
    // ai box e' presente ma non e' al volante. La UI deve poterli mostrare
    // entrambi senza chiamarli offline.
    const ingegnere: PitwallRoomMember = { ...member('popo', false), kind: 'engineer' }
    expect(isPitwallMemberFresh(ingegnere, NOW_MS)).toBe(true)
    expect(resolvePitwallRoomExecutor([ingegnere], NOW_MS).reason).toBe('nobody-driving')
    expect(isPitwallMemberFresh(member('rico', true, PITWALL_MEMBER_FRESH_MS + 1), NOW_MS)).toBe(false)
  })
})

describe('nessuna coda indefinita', () => {
  it('un ordine vive solo dentro la sua finestra', () => {
    expect(isPitwallRoomOrderExpired({ expiresAtMs: NOW_MS + 1 }, NOW_MS)).toBe(false)
    expect(isPitwallRoomOrderExpired({ expiresAtMs: NOW_MS }, NOW_MS)).toBe(true)
  })

  it('un ordine senza scadenza vale come scaduto, non come eterno', () => {
    // La direzione dell errore e' scelta: un ordine che non parte e' un
    // fastidio, uno che parte a sorpresa a situazione cambiata e' un pericolo.
    expect(isPitwallRoomOrderExpired(null, NOW_MS)).toBe(true)
    expect(isPitwallRoomOrderExpired({} as never, NOW_MS)).toBe(true)
  })

  it('l ordine nasce con la sua scadenza, senza doverla ricordare a chi invia', () => {
    const order = buildPitwallRoomOrder({
      orderId: 'ordine-1',
      revision: 12,
      senderId: 'popo',
      plan: { fuelLiters: 60 },
      nowMs: NOW_MS
    })
    expect(order?.schemaVersion).toBe(PITWALL_ROOM_SCHEMA_VERSION)
    expect(order?.status).toBe('pending')
    expect(order?.expiresAtMs).toBe(NOW_MS + PITWALL_ORDER_TTL_MS)
  })

  it('un ordine malformato si ferma prima di partire', () => {
    const base = { orderId: 'o', revision: 1, senderId: 'popo', plan: { fuelLiters: 1 }, nowMs: NOW_MS }
    expect(buildPitwallRoomOrder({ ...base, orderId: '' })).toBeNull()
    expect(buildPitwallRoomOrder({ ...base, senderId: '' })).toBeNull()
    expect(buildPitwallRoomOrder({ ...base, revision: -1 })).toBeNull()
    expect(buildPitwallRoomOrder({ ...base, plan: null as never })).toBeNull()
    const troppi = Object.fromEntries([...Array(13).keys()].map(i => [`c${i}`, i]))
    expect(buildPitwallRoomOrder({ ...base, plan: troppi })).toBeNull()
  })
})

describe('un solo ordine in volo per stanza', () => {
  it('senza lucchetto si puo prendere', () => {
    expect(isPitwallClaimAvailable(null, 'ordine-1', NOW_MS)).toBe(true)
    expect(isPitwallClaimAvailable({ orderId: null, leaseUntilMs: null }, 'ordine-1', NOW_MS)).toBe(true)
  })

  it('il secondo ordine viene rifiutato, non accodato', () => {
    const lucchetto = { orderId: 'ordine-1', leaseUntilMs: NOW_MS + 60_000 }
    expect(isPitwallClaimAvailable(lucchetto, 'ordine-2', NOW_MS)).toBe(false)
    // La riconsegna dello stesso ordine non e' un conflitto con se stesso.
    expect(isPitwallClaimAvailable(lucchetto, 'ordine-1', NOW_MS)).toBe(true)
  })

  it('se il PC che aveva preso l ordine sparisce, la stanza si sblocca', () => {
    expect(isPitwallClaimAvailable({ orderId: 'ordine-1', leaseUntilMs: NOW_MS - 1 }, 'ordine-2', NOW_MS)).toBe(true)
  })
})

describe('come si racconta una gara', () => {
  it('si legge l etichetta, non l identificativo', () => {
    expect(describePitwallRoom({ label: '#117 · Scuderia QA · Spa', closedAt: null }))
      .toBe('#117 · Scuderia QA · Spa')
    expect(describePitwallRoom({ label: '#117 · Scuderia QA · Spa', closedAt: '2026-09-01T18:00:00.000Z' }))
      .toContain('gara chiusa')
    expect(describePitwallRoom(null)).toBe('')
  })
})
