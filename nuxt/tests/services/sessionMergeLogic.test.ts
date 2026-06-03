import { describe, it, expect } from 'vitest'
import {
    normalizeTrackKey,
    buildLogicalSessionKey,
    dedupeCloudSessions,
    mergeSessionLocalPreferred,
    mergeSessionsDeterministic,
    mergeLocalFirst,
    mergePendingLocal,
} from '~/services/telemetry/sessionMergeLogic'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, any> = {}): any {
    return {
        sessionId: 'sess-001',
        fileHash: 'abc123',
        fileName: 'race.json',
        uploadedAt: null,
        rawChunkCount: 1,
        rawSizeBytes: 1000,
        source: 'cloud' as const,
        syncState: 'synced' as const,
        meta: {
            date_start: '2024-05-15T10:00:00',
            track: 'spa_francorchamps',
            car: 'ferrari_296_gt3',
            driver: 'Rossi',
        },
        summary: {},
        ...overrides,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeTrackKey
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeTrackKey', () => {
    it('lowercase e underscore per snake_case', () => {
        expect(normalizeTrackKey('spa_francorchamps')).toBe('spa_francorchamps')
    })

    it('spazi diventano underscore', () => {
        expect(normalizeTrackKey('Spa Francorchamps')).toBe('spa_francorchamps')
    })

    it('caratteri speciali rimossi', () => {
        expect(normalizeTrackKey('Monza-GP!')).toBe('monzagp')
    })

    it('stringa vuota → stringa vuota', () => {
        expect(normalizeTrackKey('')).toBe('')
    })

    it('già normalizzato → invariato', () => {
        expect(normalizeTrackKey('monza')).toBe('monza')
    })

    it('misto maiuscolo/minuscolo → tutto minuscolo', () => {
        expect(normalizeTrackKey('MoNzA')).toBe('monza')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildLogicalSessionKey
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLogicalSessionKey', () => {
    it('combina data e track normalizzato', () => {
        const key = buildLogicalSessionKey({ date_start: '2024-05-15T10:00:00', track: 'spa_francorchamps' })
        expect(key).toBe('2024-05-15T10:00:00_spa_francorchamps')
    })

    it('tronca la data al primo punto (Firestore timestamp)', () => {
        const key = buildLogicalSessionKey({ date_start: '2024-05-15T10:00:00.123456', track: 'monza' })
        expect(key).toBe('2024-05-15T10:00:00_monza')
    })

    it('meta vuoto → underscore iniziale con track vuoto', () => {
        const key = buildLogicalSessionKey({})
        expect(key).toBe('_')
    })

    it('solo track → chiave con data vuota', () => {
        const key = buildLogicalSessionKey({ track: 'monza' })
        expect(key).toBe('_monza')
    })

    it('solo date_start → chiave con track vuoto', () => {
        const key = buildLogicalSessionKey({ date_start: '2024-01-01T00:00:00' })
        expect(key).toBe('2024-01-01T00:00:00_')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// dedupeCloudSessions
// ─────────────────────────────────────────────────────────────────────────────

describe('dedupeCloudSessions', () => {
    it('lista senza duplicati rimane invariata', () => {
        const sessions = [
            makeSession({ sessionId: 's1', meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } }),
            makeSession({ sessionId: 's2', meta: { date_start: '2024-05-16T10:00:00', track: 'monza' } }),
        ]
        const result = dedupeCloudSessions(sessions)
        expect(result).toHaveLength(2)
    })

    it('duplicato logico: mantiene quello con uploadedAt più recente (number)', () => {
        const older = makeSession({ sessionId: 's1', uploadedAt: 1000, meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const newer = makeSession({ sessionId: 's2', uploadedAt: 2000, meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const result = dedupeCloudSessions([older, newer])
        expect(result).toHaveLength(1)
        expect(result[0].sessionId).toBe('s2')
    })

    it('duplicato logico: mantiene quello con uploadedAt più recente (string ISO)', () => {
        const older = makeSession({ sessionId: 's1', uploadedAt: '2024-01-01T00:00:00Z', meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const newer = makeSession({ sessionId: 's2', uploadedAt: '2024-06-01T00:00:00Z', meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const result = dedupeCloudSessions([older, newer])
        expect(result).toHaveLength(1)
        expect(result[0].sessionId).toBe('s2')
    })

    it('usa sessionId come fallback se meta non produce chiave logica', () => {
        const s1 = makeSession({ sessionId: 'unique-id', meta: {} })
        const result = dedupeCloudSessions([s1])
        expect(result).toHaveLength(1)
    })

    it('lista vuota → lista vuota', () => {
        expect(dedupeCloudSessions([])).toEqual([])
    })

    it("uploadedAt pari → l'incoming sovrascrive", () => {
        const first = makeSession({ sessionId: 's1', uploadedAt: 1000, meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const second = makeSession({ sessionId: 's2', uploadedAt: 1000, meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const result = dedupeCloudSessions([first, second])
        expect(result).toHaveLength(1)
        expect(result[0].sessionId).toBe('s2')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// mergeSessionLocalPreferred
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeSessionLocalPreferred', () => {
    it('source risultante è local', () => {
        const local = makeSession({ source: 'local', sessionId: 'l1' })
        const cloud = makeSession({ source: 'cloud', sessionId: 'c1' })
        const result = mergeSessionLocalPreferred(local, cloud)
        expect(result.source).toBe('local')
    })

    it('i campi locali sovrascrivono quelli cloud a livello root', () => {
        const local = makeSession({ sessionId: 'l1', fileName: 'local.json' })
        const cloud = makeSession({ sessionId: 'c1', fileName: 'cloud.json' })
        const result = mergeSessionLocalPreferred(local, cloud)
        expect(result.sessionId).toBe('l1')
        expect(result.fileName).toBe('local.json')
    })

    it('meta viene unito: campo cloud extra sopravvive', () => {
        const local = makeSession({ meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const cloud = makeSession({ meta: { date_start: '2024-05-15T09:00:00', track: 'spa', extra_cloud_field: 'x' } })
        const result = mergeSessionLocalPreferred(local, cloud)
        expect((result.meta as any).extra_cloud_field).toBe('x')
        // local vince su date_start
        expect(result.meta.date_start).toBe('2024-05-15T10:00:00')
    })

    it('summary viene unito analogamente a meta', () => {
        const local = makeSession({ summary: { lapCount: 10 } })
        const cloud = makeSession({ summary: { lapCount: 5, totalTime: 999 } })
        const result = mergeSessionLocalPreferred(local, cloud)
        expect((result.summary as any).lapCount).toBe(10)
        expect((result.summary as any).totalTime).toBe(999)
    })

    it('syncState locale ha priorità', () => {
        const local = makeSession({ syncState: 'pending_sync' })
        const cloud = makeSession({ syncState: 'synced' })
        const result = mergeSessionLocalPreferred(local, cloud)
        expect(result.syncState).toBe('pending_sync')
    })

    it('syncState cloud usato se locale è undefined', () => {
        const local = makeSession({ syncState: undefined })
        const cloud = makeSession({ syncState: 'synced' })
        const result = mergeSessionLocalPreferred(local, cloud)
        expect(result.syncState).toBe('synced')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// mergeSessionsDeterministic
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeSessionsDeterministic', () => {
    it('sessioni cloud senza local → restituisce solo cloud', () => {
        const cloud = [makeSession({ sessionId: 'c1' })]
        const result = mergeSessionsDeterministic([], cloud, { localWins: true, includeSyncedLocal: true })
        expect(result).toHaveLength(1)
        expect(result[0].sessionId).toBe('c1')
    })

    it('sessioni local senza cloud → restituisce local', () => {
        const local = [makeSession({ sessionId: 'l1', source: 'local', syncState: 'pending_sync' })]
        const result = mergeSessionsDeterministic(local, [], { localWins: true, includeSyncedLocal: true })
        expect(result).toHaveLength(1)
    })

    it('localWins: true → i dati local sovrascrivono cloud per stessa chiave logica', () => {
        const meta = { date_start: '2024-05-15T10:00:00', track: 'spa' }
        const local = makeSession({ sessionId: 'l1', source: 'local', syncState: 'pending_sync', meta, fileName: 'local.json' })
        const cloud = makeSession({ sessionId: 'c1', source: 'cloud', meta, fileName: 'cloud.json' })
        const result = mergeSessionsDeterministic([local], [cloud], { localWins: true, includeSyncedLocal: true })
        expect(result).toHaveLength(1)
        expect(result[0].fileName).toBe('local.json')
    })

    it('includeSyncedLocal: false → esclude local synced', () => {
        const meta = { date_start: '2024-05-15T10:00:00', track: 'monza' }
        const local = makeSession({ sessionId: 'l1', source: 'local', syncState: 'synced', meta })
        const result = mergeSessionsDeterministic([local], [], { localWins: true, includeSyncedLocal: false })
        expect(result).toHaveLength(0)
    })

    it('includeSyncedLocal: true → include local synced', () => {
        const meta = { date_start: '2024-05-15T10:00:00', track: 'monza' }
        const local = makeSession({ sessionId: 'l1', source: 'local', syncState: 'synced', meta })
        const result = mergeSessionsDeterministic([local], [], { localWins: true, includeSyncedLocal: true })
        expect(result).toHaveLength(1)
    })

    it('risultato ordinato per date_start decrescente', () => {
        const cloud = [
            makeSession({ sessionId: 'c1', meta: { date_start: '2024-03-01T10:00:00', track: 'monza' } }),
            makeSession({ sessionId: 'c2', meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } }),
        ]
        const result = mergeSessionsDeterministic([], cloud, { localWins: true, includeSyncedLocal: true })
        expect(result[0].meta.date_start).toBe('2024-05-15T10:00:00')
        expect(result[1].meta.date_start).toBe('2024-03-01T10:00:00')
    })

    it('match per sessionId ha priorità sulla chiave logica', () => {
        // local e cloud condividono sessionId → merge avviene tramite bySessionId
        const meta = { date_start: '2024-05-15T10:00:00', track: 'spa' }
        const cloud = makeSession({ sessionId: 'shared-id', source: 'cloud', meta })
        const local = makeSession({ sessionId: 'shared-id', source: 'local', syncState: 'pending_sync', meta, fileName: 'matched.json' })
        const result = mergeSessionsDeterministic([local], [cloud], { localWins: true, includeSyncedLocal: true })
        expect(result).toHaveLength(1)
        expect(result[0].fileName).toBe('matched.json')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// mergeLocalFirst
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeLocalFirst', () => {
    it('chiama mergeSessionsDeterministic con localWins:true e includeSyncedLocal:true', () => {
        const meta = { date_start: '2024-05-15T10:00:00', track: 'spa' }
        const local = makeSession({ sessionId: 'l1', source: 'local', syncState: 'synced', meta, fileName: 'local.json' })
        const cloud = makeSession({ sessionId: 'c1', source: 'cloud', meta, fileName: 'cloud.json' })
        const result = mergeLocalFirst([local], [cloud])
        // synced local incluso + local vince
        expect(result).toHaveLength(1)
        expect(result[0].fileName).toBe('local.json')
    })

    it('lista vuota di entrambi → lista vuota', () => {
        expect(mergeLocalFirst([], [])).toEqual([])
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// mergePendingLocal
// ─────────────────────────────────────────────────────────────────────────────

describe('mergePendingLocal', () => {
    it('includeLocal:false → ritorna solo cloudPage invariato', () => {
        const cloud = [makeSession({ sessionId: 'c1' })]
        const local = [makeSession({ sessionId: 'l1', source: 'local', syncState: 'pending_sync' })]
        const result = mergePendingLocal(cloud, local, false)
        expect(result).toHaveLength(1)
        expect(result[0].sessionId).toBe('c1')
    })

    it('local con syncState synced non viene incluso', () => {
        const cloud = [makeSession({ sessionId: 'c1', meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })]
        const local = [makeSession({ sessionId: 'l1', source: 'local', syncState: 'synced', meta: { date_start: '2024-04-01T10:00:00', track: 'monza' } })]
        const result = mergePendingLocal(cloud, local, true)
        expect(result).toHaveLength(1)
    })

    it('local pending non presente in cloud → aggiunto', () => {
        const cloud = [makeSession({ sessionId: 'c1', meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })]
        const local = [makeSession({ sessionId: 'l1', source: 'local', syncState: 'pending_sync', meta: { date_start: '2024-04-01T10:00:00', track: 'monza' } })]
        const result = mergePendingLocal(cloud, local, true)
        expect(result).toHaveLength(2)
    })

    it('local già presente in cloud per sessionId → non duplicato', () => {
        const shared = makeSession({ sessionId: 'shared', syncState: 'pending_sync', meta: { date_start: '2024-05-15T10:00:00', track: 'spa' } })
        const result = mergePendingLocal([shared], [shared], true)
        expect(result).toHaveLength(1)
    })

    it('local già presente in cloud per chiave logica → non duplicato', () => {
        const meta = { date_start: '2024-05-15T10:00:00', track: 'spa' }
        const cloud = makeSession({ sessionId: 'c1', meta })
        const local = makeSession({ sessionId: 'l1', syncState: 'pending_sync', meta })
        const result = mergePendingLocal([cloud], [local], true)
        expect(result).toHaveLength(1)
    })

    it('risultato ordinato per date_start decrescente', () => {
        const cloud = [makeSession({ sessionId: 'c1', meta: { date_start: '2024-03-01T10:00:00', track: 'monza' } })]
        const local = [makeSession({ sessionId: 'l1', syncState: 'pending_sync', meta: { date_start: '2024-06-01T10:00:00', track: 'spa' } })]
        const result = mergePendingLocal(cloud, local, true)
        expect(result[0].meta.date_start).toBe('2024-06-01T10:00:00')
    })
})
