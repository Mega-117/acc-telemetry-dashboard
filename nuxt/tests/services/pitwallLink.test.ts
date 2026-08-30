import { describe, expect, it } from 'vitest'
import {
  PITWALL_GRANT_STATUSES,
  PITWALL_ORDER_STATUSES,
  PITWALL_TERMINAL_ORDER_STATUSES,
  buildPitwallGrantRequest,
  buildPitwallOrderDocument,
  buildPitwallPreAuthorisation,
  describePitwallLinkError,
  describePitwallOrderStatus,
  isPitwallGrantUsable,
  isPitwallOrderSettled,
  isPitwallSessionFresh,
  pitwallGrantId,
  type PitwallSession
} from '~/services/pitwall/pitwallLink'

const DRIVER = 'pilota-1'
const ENGINEER = 'ingegnere-1'
const NOW_ISO = '2026-08-30T15:00:00.000Z'
const NOW_MS = Date.parse(NOW_ISO)

function session(overrides: Partial<PitwallSession> = {}): PitwallSession {
  return {
    schemaVersion: 1,
    driverUid: DRIVER,
    sessionId: 's-1',
    online: true,
    updatedAt: NOW_ISO,
    ...overrides
  }
}

describe('id del permesso', () => {
  it('deriva dai due account, cosi non esistono doppioni divergenti', () => {
    expect(pitwallGrantId(DRIVER, ENGINEER)).toBe('pilota-1__ingegnere-1')
  })

  it('non e simmetrico: chi guida e chi assiste non sono intercambiabili', () => {
    expect(pitwallGrantId(DRIVER, ENGINEER)).not.toBe(pitwallGrantId(ENGINEER, DRIVER))
  })
})

describe('richiesta e pre-autorizzazione', () => {
  it('la richiesta dell ingegnere nasce in attesa e a suo nome', () => {
    const request = buildPitwallGrantRequest(DRIVER, ENGINEER, NOW_ISO)
    expect(request?.data.status).toBe('pending')
    expect(request?.data.createdBy).toBe(ENGINEER)
  })

  it('la pre-autorizzazione del pilota nasce concessa e a nome suo', () => {
    const grant = buildPitwallPreAuthorisation(DRIVER, ENGINEER, NOW_ISO)
    expect(grant?.data.status).toBe('granted')
    expect(grant?.data.createdBy).toBe(DRIVER)
  })

  it('non si costruisce un collegamento verso se stessi o senza account', () => {
    expect(buildPitwallGrantRequest(DRIVER, DRIVER, NOW_ISO)).toBeNull()
    expect(buildPitwallGrantRequest('', ENGINEER, NOW_ISO)).toBeNull()
    expect(buildPitwallGrantRequest(DRIVER, '', NOW_ISO)).toBeNull()
  })

  it('la nota resta dentro il limite imposto dalle regole', () => {
    const request = buildPitwallGrantRequest(DRIVER, ENGINEER, NOW_ISO, 'x'.repeat(500))
    expect(request?.data.note).toHaveLength(200)
  })
})

describe('validita del permesso', () => {
  it('vale solo se concesso e per la coppia attesa', () => {
    const grant = buildPitwallPreAuthorisation(DRIVER, ENGINEER, NOW_ISO)!.data
    expect(isPitwallGrantUsable(grant, DRIVER, ENGINEER)).toBe(true)
    expect(isPitwallGrantUsable(grant, 'altro-pilota', ENGINEER)).toBe(false)
    expect(isPitwallGrantUsable(grant, DRIVER, 'altro-ingegnere')).toBe(false)
    expect(isPitwallGrantUsable({ ...grant, status: 'revoked' }, DRIVER, ENGINEER)).toBe(false)
    expect(isPitwallGrantUsable({ ...grant, status: 'pending' }, DRIVER, ENGINEER)).toBe(false)
    expect(isPitwallGrantUsable(null, DRIVER, ENGINEER)).toBe(false)
  })
})

describe('raggiungibilita del pilota', () => {
  it('e raggiungibile solo se online e con presenza recente', () => {
    expect(isPitwallSessionFresh(session(), NOW_MS)).toBe(true)
    expect(isPitwallSessionFresh(session({ online: false }), NOW_MS)).toBe(false)
    expect(isPitwallSessionFresh(null, NOW_MS)).toBe(false)
  })

  it('una presenza vecchia non conta come raggiungibile', () => {
    expect(isPitwallSessionFresh(session(), NOW_MS + 200_000)).toBe(false)
  })

  it('una data illeggibile non viene interpretata come recente', () => {
    expect(isPitwallSessionFresh(session({ updatedAt: 'non-una-data' }), NOW_MS)).toBe(false)
  })
})

describe('documento dell ordine', () => {
  it('nasce sempre in attesa: l esito lo dichiara il PC del pilota', () => {
    const order = buildPitwallOrderDocument({
      orderId: 'o-1', revision: 1, senderId: ENGINEER, plan: { fuelLiters: 60 }, nowIso: NOW_ISO
    })
    expect(order?.status).toBe('pending')
    expect(order?.senderId).toBe(ENGINEER)
  })

  it('rifiuta un piano oltre il limite imposto dalle regole, con un motivo locale', () => {
    const plan = Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`campo${index}`, index]))
    expect(buildPitwallOrderDocument({
      orderId: 'o-1', revision: 1, senderId: ENGINEER, plan, nowIso: NOW_ISO
    })).toBeNull()
  })

  it('rifiuta identita o revisione non valide', () => {
    const base = { orderId: 'o-1', revision: 1, senderId: ENGINEER, plan: { fuelLiters: 1 }, nowIso: NOW_ISO }
    expect(buildPitwallOrderDocument({ ...base, orderId: '' })).toBeNull()
    expect(buildPitwallOrderDocument({ ...base, senderId: '' })).toBeNull()
    expect(buildPitwallOrderDocument({ ...base, revision: -1 })).toBeNull()
    expect(buildPitwallOrderDocument({ ...base, revision: 1.5 })).toBeNull()
  })
})

describe('come si racconta l esito all ingegnere', () => {
  it('gli stati conclusi sono esattamente quelli oltre cui nulla cambia', () => {
    expect([...PITWALL_TERMINAL_ORDER_STATUSES].sort()).toEqual(['applied', 'failed', 'partial', 'rejected'])
    expect(isPitwallOrderSettled('applied')).toBe(true)
    expect(isPitwallOrderSettled('applying')).toBe(false)
    expect(isPitwallOrderSettled(null)).toBe(false)
  })

  it('un esito parziale viene mostrato come problema, non come riuscito', () => {
    expect(describePitwallOrderStatus('partial')).toMatchObject({ busy: false, problem: true })
    expect(describePitwallOrderStatus('applied')).toMatchObject({ busy: false, problem: false })
  })

  it('mentre e in corso lo dichiara, invece di sembrare finito', () => {
    expect(describePitwallOrderStatus('pending').busy).toBe(true)
    expect(describePitwallOrderStatus('applying').busy).toBe(true)
  })

  it('ogni stato previsto ha una sua descrizione, senza cadere nel generico', () => {
    const fallback = describePitwallOrderStatus(null).label
    for (const status of PITWALL_ORDER_STATUSES) {
      expect(describePitwallOrderStatus(status).label).not.toBe(fallback)
    }
  })

  it('gli stati del permesso sono i tre previsti dalle regole', () => {
    expect([...PITWALL_GRANT_STATUSES].sort()).toEqual(['granted', 'pending', 'revoked'])
  })
})

describe('cosa legge l ingegnere quando qualcosa non va', () => {
  it('un permesso negato diventa una frase che dice cosa fare', () => {
    const message = describePitwallLinkError('FirebaseError: Missing or insufficient permissions.')
    expect(message).toMatch(/permesso negato/i)
    expect(message).not.toMatch(/insufficient permissions/i)
  })

  it('un problema di rete non viene scambiato per un divieto', () => {
    expect(describePitwallLinkError('Failed to get document because the client is offline'))
      .toMatch(/connessione/i)
    expect(describePitwallLinkError('unavailable')).toMatch(/connessione/i)
  })

  it('il limite del servizio si distingue dagli altri errori', () => {
    expect(describePitwallLinkError('resource-exhausted: quota')).toMatch(/limite/i)
  })

  it('senza errore non si inventa un messaggio', () => {
    expect(describePitwallLinkError(null)).toBeNull()
    expect(describePitwallLinkError('')).toBeNull()
  })

  it('un errore sconosciuto si mostra com e, invece di essere nascosto', () => {
    expect(describePitwallLinkError('Qualcosa di imprevisto')).toBe('Qualcosa di imprevisto')
  })
})
