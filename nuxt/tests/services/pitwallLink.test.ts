import { describe, expect, it } from 'vitest'
import {
  PITWALL_GRANT_STATUSES,
  PITWALL_ORDER_STATUSES,
  PITWALL_TERMINAL_ORDER_STATUSES,
  boundPitwallCrew,
  boundPitwallStrategy,
  buildPitwallGrantRequest,
  buildPitwallOrderDocument,
  buildPitwallPreAuthorisation,
  describePitwallExecutor,
  describePitwallGrantScope,
  describePitwallLinkError,
  describePitwallOrderStatus,
  resolvePitwallExecutor,
  isPitwallGrantUsable,
  isPitwallOrderSettled,
  isPitwallSessionFresh,
  matchesPitwallSearch,
  pitwallGrantId,
  pitwallSearchVariants,
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

describe('cercare un utente senza badare alle maiuscole', () => {
  it('cerca il termine anche in maiuscolo, minuscolo e con iniziale grande', () => {
    // Firestore confronta byte per byte: senza varianti, "ri" non troverebbe
    // mai "RICO117". E successo davvero in prova reale.
    const variants = pitwallSearchVariants('ri')
    expect(variants).toContain('ri')
    expect(variants).toContain('RI')
    expect(variants).toContain('Ri')
  })

  it('non ripete la stessa variante due volte, per non pagare query inutili', () => {
    expect(pitwallSearchVariants('RI')).toEqual([...new Set(pitwallSearchVariants('RI'))])
    expect(new Set(pitwallSearchVariants('abc')).size).toBe(pitwallSearchVariants('abc').length)
  })

  it('sotto la lunghezza minima non si cerca nulla', () => {
    expect(pitwallSearchVariants('r')).toEqual([])
    expect(pitwallSearchVariants(' ')).toEqual([])
    expect(pitwallSearchVariants('')).toEqual([])
  })

  it('ignora spazi accidentali intorno al termine', () => {
    expect(pitwallSearchVariants('  ri  ')).toContain('ri')
  })

  it('il filtro finale accetta il prefisso a prescindere dalle maiuscole', () => {
    expect(matchesPitwallSearch('RICO117', 'ri')).toBe(true)
    expect(matchesPitwallSearch('RICO117', 'RIC')).toBe(true)
    expect(matchesPitwallSearch('ricoro', 'RI')).toBe(true)
    expect(matchesPitwallSearch('Enrico', 'ri')).toBe(false)
  })
})

describe('portata del permesso: solo per oggi contro sempre', () => {
  const grant = () => ({
    schemaVersion: 1 as const,
    driverUid: DRIVER,
    engineerUid: ENGINEER,
    status: 'granted' as const,
    createdBy: DRIVER,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  })

  it('un permesso "solo per oggi" scaduto vale come una revoca', () => {
    const once = { ...grant(), scope: 'once' as const, expiresAtMs: NOW_MS + 1000 }
    expect(isPitwallGrantUsable(once, DRIVER, ENGINEER, NOW_MS)).toBe(true)
    expect(isPitwallGrantUsable(once, DRIVER, ENGINEER, NOW_MS + 1001)).toBe(false)
  })

  it('"sempre" non scade mai da solo', () => {
    const always = { ...grant(), scope: 'always' as const, expiresAtMs: null }
    expect(isPitwallGrantUsable(always, DRIVER, ENGINEER, NOW_MS + 10_000_000)).toBe(true)
  })

  it('la portata si racconta senza gergo', () => {
    expect(describePitwallGrantScope({ scope: 'always', expiresAtMs: null })).toBe('permanente')
    expect(describePitwallGrantScope({ scope: 'once', expiresAtMs: null })).toBe('per oggi')
    expect(describePitwallGrantScope({ scope: 'once', expiresAtMs: NOW_MS })).toContain('per oggi')
    expect(describePitwallGrantScope({ scope: 'once', expiresAtMs: NOW_MS })).toContain('scade alle')
    // Un permesso storico senza portata resta permanente: era il
    // comportamento in vigore quando e' stato concesso.
    expect(describePitwallGrantScope({ scope: null, expiresAtMs: null })).toBe('permanente')
  })
})

describe('fotografia della vettura nella presenza', () => {
  it('l equipaggio si ferma al tetto e i nomi restano corti', () => {
    const crew = boundPitwallCrew(Array.from({ length: 20 }, (_, index) => ({
      driverIndex: index,
      name: 'Nome molto lungo '.repeat(10),
      current: index === 2
    })))
    expect(crew).toHaveLength(16)
    expect(crew?.[2]?.current).toBe(true)
    expect(crew?.[0]?.name.length).toBeLessThanOrEqual(60)
  })

  it('senza equipaggio non si inventa una lista', () => {
    expect(boundPitwallCrew(null)).toBeNull()
    expect(boundPitwallCrew([])).toBeNull()
    expect(boundPitwallCrew('non-una-lista')).toBeNull()
  })

  it('la strategia tiene solo numeri veri: un valore assente resta assente', () => {
    const strategy = boundPitwallStrategy({
      fuelToAdd: 42,
      tyreSet: null,
      pressures: { FL: 24.4, FR: 26.1, RL: 24.8, RR: 25.9 },
      compound: 'wet'
    }, NOW_ISO)
    expect(strategy).toEqual({
      fuelToAdd: 42,
      tyreSet: null,
      pressures: { FL: 24.4, FR: 26.1, RL: 24.8, RR: 25.9 },
      compound: 'wet',
      updatedAt: NOW_ISO
    })
  })

  it('pressioni incomplete o mescola inventata non passano', () => {
    const strategy = boundPitwallStrategy({ pressures: { FL: 24.4 }, compound: 'intermedia' }, NOW_ISO)
    expect(strategy?.pressures).toBeNull()
    expect(strategy?.compound).toBeNull()
    expect(strategy?.fuelToAdd).toBeNull()
  })
})

describe('chi esegue l ordine dentro la stanza', () => {
  const member = (uid: string, driving: boolean, ageMs = 0) => ({
    uid,
    nickname: uid.toUpperCase(),
    driving,
    updatedAt: new Date(NOW_MS - ageMs).toISOString()
  })

  it('con un solo pilota al volante lo indica senza esitare', () => {
    const resolution = resolvePitwallExecutor(
      [member('rico', true), member('popo', false)],
      NOW_MS
    )
    expect(resolution.reason).toBe('ready')
    expect(resolution.executor?.uid).toBe('rico')
    expect(describePitwallExecutor(resolution)).toContain('RICO')
  })

  it('il cambio pilota si risolve da se: chi guida adesso esegue', () => {
    // Rico scende, Pippo sale: nessuno tocca niente lato ingegnere.
    const prima = resolvePitwallExecutor([member('rico', true), member('pippo', false)], NOW_MS)
    const dopo = resolvePitwallExecutor([member('rico', false), member('pippo', true)], NOW_MS)
    expect(prima.executor?.uid).toBe('rico')
    expect(dopo.executor?.uid).toBe('pippo')
  })

  it('chi ha spento il PC resta nella stanza ma non esegue piu', () => {
    // Battito vecchio di cinque minuti: c e', ma non e' al volante davvero.
    const resolution = resolvePitwallExecutor([member('rico', true, 5 * 60_000)], NOW_MS)
    expect(resolution.reason).toBe('nobody-driving')
    expect(resolution.executor).toBeNull()
  })

  it('due che si dichiarano al volante fermano l ordine, senza indovinare', () => {
    const resolution = resolvePitwallExecutor(
      [member('rico', true), member('pippo', true)],
      NOW_MS
    )
    expect(resolution.reason).toBe('multiple-driving')
    expect(resolution.executor).toBeNull()
    expect(resolution.conflicting.map(m => m.uid)).toEqual(['rico', 'pippo'])
    expect(describePitwallExecutor(resolution)).toContain('RICO')
  })

  it('una stanza vuota si distingue da una stanza senza nessuno al volante', () => {
    expect(resolvePitwallExecutor([], NOW_MS).reason).toBe('empty-room')
    expect(resolvePitwallExecutor(null, NOW_MS).reason).toBe('empty-room')
    expect(resolvePitwallExecutor([member('popo', false)], NOW_MS).reason).toBe('nobody-driving')
  })

  it('una data illeggibile non conta come presenza valida', () => {
    const rotto = { uid: 'rico', nickname: 'RICO', driving: true, updatedAt: 'non-una-data' }
    expect(resolvePitwallExecutor([rotto], NOW_MS).reason).toBe('nobody-driving')
  })
})
