import { describe, it, expect } from 'vitest'
import {
    OVERVIEW_GRIP_PRIORITY,
    OVERVIEW_GRIP_SCAN_ORDER,
    buildBestTimesFromTrackBestDoc,
    updateBestTimeWithGrip,
    buildOverviewBestTimesFromTrackBestDoc,
    buildTrackBestsMapFromDocs,
    updateBestTime,
    mergePendingBestsByTrack,
    mergePendingOverviewBestsByTrack,
    type TrackBestTimes
} from '~/services/gateway/bestTimesBuilders'
import type { SessionDocument } from '~/composables/useTelemetryData'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeSession(overrides: Partial<{
    car: string
    track: string
    date_start: string
    session_type: number
    bestQualy: number | null
    bestRace: number | null
    bestAvgRace: number | null
    grip: string
}>  = {}): SessionDocument {
    const grip = overrides.grip ?? 'Optimum'
    const gripBests: any = {}
    if (overrides.bestQualy != null) gripBests.bestQualy = overrides.bestQualy
    if (overrides.bestRace != null) gripBests.bestRace = overrides.bestRace
    if (overrides.bestAvgRace != null) gripBests.bestAvgRace = overrides.bestAvgRace

    return {
        sessionId: 'sess-001',
        fileHash: 'abc',
        fileName: 'session.json',
        uploadedAt: null,
        rawChunkCount: 0,
        rawSizeBytes: 0,
        meta: {
            track: overrides.track ?? 'monza',
            car: overrides.car ?? 'ferrari_296_gt3',
            date_start: overrides.date_start ?? '2024-06-01T10:00:00',
            date_end: null,
            session_type: overrides.session_type ?? 2,
            driver: null
        },
        summary: {
            laps: 10,
            lapsValid: 8,
            bestLap: null,
            avgCleanLap: null,
            totalTime: 1800000,
            stintCount: 1,
            best_by_grip: {
                [grip]: Object.keys(gripBests).length > 0 ? gripBests : undefined
            }
        }
    }
}

function makeTrackBestDoc(bests: any, overrides: Record<string, any> = {}) {
    return {
        version: 4,
        bestRulesVersion: 5,
        bests,
        ...overrides
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
describe('OVERVIEW_GRIP_PRIORITY', () => {
    it('contiene 7 grip conditions', () => {
        expect(OVERVIEW_GRIP_PRIORITY).toHaveLength(7)
    })

    it('Optimum è il primo (priorità massima)', () => {
        expect(OVERVIEW_GRIP_PRIORITY[0]).toBe('Optimum')
    })

    it('Flood è l\'ultimo (priorità minima)', () => {
        expect(OVERVIEW_GRIP_PRIORITY[OVERVIEW_GRIP_PRIORITY.length - 1]).toBe('Flood')
    })
})

describe('OVERVIEW_GRIP_SCAN_ORDER', () => {
    it('è l\'inverso di OVERVIEW_GRIP_PRIORITY', () => {
        expect(OVERVIEW_GRIP_SCAN_ORDER).toEqual([...OVERVIEW_GRIP_PRIORITY].reverse())
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildBestTimesFromTrackBestDoc
// ─────────────────────────────────────────────────────────────────────────────
describe('buildBestTimesFromTrackBestDoc', () => {
    it('estrae i best times da un documento valido', () => {
        const doc = makeTrackBestDoc({
            GT3: {
                Optimum: {
                    bestQualy: 83456,
                    bestRace: 84000,
                    bestAvgRace: 84500
                }
            }
        })
        const result = buildBestTimesFromTrackBestDoc(doc, 'GT3', 'Optimum')
        expect(result.bestQualy).toBe(83456)
        expect(result.bestRace).toBe(84000)
        expect(result.bestAvgRace).toBe(84500)
    })

    it('usa GT3/Optimum come default', () => {
        const doc = makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 90000 } } })
        const result = buildBestTimesFromTrackBestDoc(doc)
        expect(result.bestQualy).toBe(90000)
    })

    it('restituisce null per tutti i campi se il doc è null', () => {
        const result = buildBestTimesFromTrackBestDoc(null)
        expect(result.bestQualy).toBeNull()
        expect(result.bestRace).toBeNull()
        expect(result.bestAvgRace).toBeNull()
    })

    it('restituisce null se la categoria non esiste', () => {
        const doc = makeTrackBestDoc({})
        const result = buildBestTimesFromTrackBestDoc(doc, 'GT4', 'Optimum')
        expect(result.bestQualy).toBeNull()
    })

    it('restituisce null se il grip non esiste', () => {
        const doc = makeTrackBestDoc({ GT3: {} })
        const result = buildBestTimesFromTrackBestDoc(doc, 'GT3', 'Wet')
        expect(result.bestRace).toBeNull()
    })

    it('gestisce campi mancanti (parziale)', () => {
        const doc = makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 83456 } } })
        const result = buildBestTimesFromTrackBestDoc(doc, 'GT3', 'Optimum')
        expect(result.bestQualy).toBe(83456)
        expect(result.bestRace).toBeNull()
        expect(result.bestAvgRace).toBeNull()
    })

    it('gestisce valori 0 come null (falsy)', () => {
        const doc = makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 0, bestRace: 84000 } } })
        const result = buildBestTimesFromTrackBestDoc(doc, 'GT3', 'Optimum')
        expect(result.bestQualy).toBeNull()
        expect(result.bestRace).toBe(84000)
    })

    it('non usa documenti trackBests legacy senza schema/regole VNext', () => {
        const doc = makeTrackBestDoc(
            { GT3: { Optimum: { bestQualy: 83456, bestRace: 84000, bestAvgRace: 84500 } } },
            { version: 3, bestRulesVersion: 3 }
        )
        const result = buildBestTimesFromTrackBestDoc(doc, 'GT3', 'Optimum')
        expect(result.bestQualy).toBeNull()
        expect(result.bestRace).toBeNull()
        expect(result.bestAvgRace).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// updateBestTimeWithGrip
// ─────────────────────────────────────────────────────────────────────────────
describe('updateBestTimeWithGrip', () => {
    it('imposta il valore se target è null', () => {
        const target: TrackBestTimes = { bestQualy: null, bestRace: null, bestAvgRace: null }
        updateBestTimeWithGrip(target, 'bestQualy', 'bestQualyGrip', 83456, 'Optimum')
        expect(target.bestQualy).toBe(83456)
        expect(target.bestQualyGrip).toBe('Optimum')
    })

    it('aggiorna se il candidato è migliore (più basso)', () => {
        const target: TrackBestTimes = { bestQualy: 84000, bestQualyGrip: 'Optimum', bestRace: null, bestAvgRace: null }
        updateBestTimeWithGrip(target, 'bestQualy', 'bestQualyGrip', 83500, 'Fast')
        expect(target.bestQualy).toBe(83500)
        expect(target.bestQualyGrip).toBe('Fast')
    })

    it('non aggiorna se il candidato è peggiore', () => {
        const target: TrackBestTimes = { bestQualy: 83000, bestQualyGrip: 'Optimum', bestRace: null, bestAvgRace: null }
        updateBestTimeWithGrip(target, 'bestQualy', 'bestQualyGrip', 84000, 'Fast')
        expect(target.bestQualy).toBe(83000)
        expect(target.bestQualyGrip).toBe('Optimum')
    })

    it('in caso di pareggio preferisce il grip con priorità più alta (indice più basso)', () => {
        // Optimum (index 0) ha priorità più alta di Fast (index 1)
        const target: TrackBestTimes = { bestQualy: 83456, bestQualyGrip: 'Fast', bestRace: null, bestAvgRace: null }
        updateBestTimeWithGrip(target, 'bestQualy', 'bestQualyGrip', 83456, 'Optimum')
        expect(target.bestQualyGrip).toBe('Optimum')
    })

    it('non aggiorna per candidato null', () => {
        const target: TrackBestTimes = { bestQualy: 83000, bestQualyGrip: 'Optimum', bestRace: null, bestAvgRace: null }
        updateBestTimeWithGrip(target, 'bestQualy', 'bestQualyGrip', null, 'Wet')
        expect(target.bestQualy).toBe(83000)
    })

    it('non aggiorna per candidato 0', () => {
        const target: TrackBestTimes = { bestQualy: 83000, bestQualyGrip: 'Optimum', bestRace: null, bestAvgRace: null }
        updateBestTimeWithGrip(target, 'bestQualy', 'bestQualyGrip', 0, 'Wet')
        expect(target.bestQualy).toBe(83000)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildOverviewBestTimesFromTrackBestDoc
// ─────────────────────────────────────────────────────────────────────────────
describe('buildOverviewBestTimesFromTrackBestDoc', () => {
    it('restituisce tutti null per doc null', () => {
        const result = buildOverviewBestTimesFromTrackBestDoc(null)
        expect(result.bestQualy).toBeNull()
        expect(result.bestRace).toBeNull()
        expect(result.bestAvgRace).toBeNull()
        expect(result.bestQualyGrip).toBeNull()
        expect(result.bestRaceGrip).toBeNull()
        expect(result.bestAvgRaceGrip).toBeNull()
    })

    it('seleziona il miglior tempo da tutti i grip disponibili', () => {
        const doc = makeTrackBestDoc({
            GT3: {
                Wet: { bestQualy: 90000, bestRace: 91000, bestAvgRace: 92000 },
                Optimum: { bestQualy: 83456, bestRace: 84000, bestAvgRace: 84500 }
            }
        })
        const result = buildOverviewBestTimesFromTrackBestDoc(doc, 'GT3')
        expect(result.bestQualy).toBe(83456)
        expect(result.bestQualyGrip).toBe('Optimum')
    })

    it('in parità seleziona il grip con priorità più alta', () => {
        // Flood ha indice 0 in SCAN_ORDER, scansionato primo; Optimum ultimo
        // Se stesso tempo, Optimum (priorità più alta in PRIORITY) deve vincere
        const doc = makeTrackBestDoc({
            GT3: {
                Flood: { bestQualy: 83456 },
                Optimum: { bestQualy: 83456 }
            }
        })
        const result = buildOverviewBestTimesFromTrackBestDoc(doc, 'GT3')
        expect(result.bestQualyGrip).toBe('Optimum')
    })

    it('gestisce categoria mancante (doc senza bests)', () => {
        const doc = makeTrackBestDoc({})
        const result = buildOverviewBestTimesFromTrackBestDoc(doc, 'GT3')
        expect(result.bestQualy).toBeNull()
    })

    it('gestisce doc senza bests property', () => {
        const doc = {}
        const result = buildOverviewBestTimesFromTrackBestDoc(doc)
        expect(result.bestRace).toBeNull()
    })

    it('usa GT3 come default', () => {
        const doc = makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 83456 } } })
        const result = buildOverviewBestTimesFromTrackBestDoc(doc)
        expect(result.bestQualy).toBe(83456)
    })

    it('scansiona più condizioni e ottiene best per ogni campo separatamente', () => {
        const doc = makeTrackBestDoc({
            GT3: {
                Wet: { bestQualy: 90000, bestRace: 91000 },
                Green: { bestQualy: 85000, bestRace: 93000 },
                Optimum: { bestQualy: 83000, bestRace: 94000 }
            }
        })
        const result = buildOverviewBestTimesFromTrackBestDoc(doc, 'GT3')
        // bestQualy: Optimum 83000, bestRace: Wet 91000
        expect(result.bestQualy).toBe(83000)
        expect(result.bestQualyGrip).toBe('Optimum')
        expect(result.bestRace).toBe(91000)
        expect(result.bestRaceGrip).toBe('Wet')
    })

    it('non usa documenti legacy per i best overview', () => {
        const doc = makeTrackBestDoc(
            { GT3: { Optimum: { bestQualy: 83456, bestRace: 84000, bestAvgRace: 84500 } } },
            { version: 3, bestRulesVersion: 3 }
        )
        const result = buildOverviewBestTimesFromTrackBestDoc(doc, 'GT3')
        expect(result.bestQualy).toBeNull()
        expect(result.bestRace).toBeNull()
        expect(result.bestAvgRace).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildTrackBestsMapFromDocs
// ─────────────────────────────────────────────────────────────────────────────
describe('buildTrackBestsMapFromDocs', () => {
    it('crea una mappa trackId → TrackBestTimes', () => {
        const docs = {
            monza: makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 83456 } } }, { trackId: 'monza' })
        }
        const result = buildTrackBestsMapFromDocs(docs)
        expect(result['monza']).toBeDefined()
        expect(result['monza'].bestQualy).toBe(83456)
    })

    it('normalizza il trackId (usa doc.trackId se disponibile)', () => {
        const docs = {
            'Monza Circuit': makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 83456 } } }, { trackId: 'monza' })
        }
        const result = buildTrackBestsMapFromDocs(docs)
        expect(result['monza']).toBeDefined()
    })

    it('gestisce oggetto vuoto', () => {
        const result = buildTrackBestsMapFromDocs({})
        expect(Object.keys(result)).toHaveLength(0)
    })

    it('gestisce null/undefined come input (guard interno)', () => {
        const result = buildTrackBestsMapFromDocs(null as any)
        expect(Object.keys(result)).toHaveLength(0)
    })

    it('salta entry senza trackId valido', () => {
        const docs = {
            '': makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 83456 } } })
        }
        const result = buildTrackBestsMapFromDocs(docs)
        expect(Object.keys(result)).toHaveLength(0)
    })

    it('gestisce più tracciati', () => {
        const docs = {
            monza: makeTrackBestDoc({ GT3: { Optimum: { bestQualy: 83000 } } }, { trackId: 'monza' }),
            spa: makeTrackBestDoc({ GT3: { Optimum: { bestRace: 136000 } } }, { trackId: 'spa' })
        }
        const result = buildTrackBestsMapFromDocs(docs)
        expect(Object.keys(result)).toHaveLength(2)
        expect(result['spa'].bestRace).toBe(136000)
    })

    it('salta documenti trackBests legacy nella mappa', () => {
        const docs = {
            monza: makeTrackBestDoc(
                { GT3: { Optimum: { bestRace: 107637, bestAvgRace: 108079 } } },
                { trackId: 'monza', version: 3, bestRulesVersion: 3 }
            )
        }
        const result = buildTrackBestsMapFromDocs(docs)
        expect(result['monza']).toBeUndefined()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// updateBestTime
// ─────────────────────────────────────────────────────────────────────────────
describe('updateBestTime', () => {
    it('imposta il valore se target è null', () => {
        const target: TrackBestTimes = { bestQualy: null, bestRace: null, bestAvgRace: null }
        updateBestTime(target, 'bestRace', 84000)
        expect(target.bestRace).toBe(84000)
    })

    it('aggiorna se il candidato è migliore', () => {
        const target: TrackBestTimes = { bestQualy: null, bestRace: 85000, bestAvgRace: null }
        updateBestTime(target, 'bestRace', 84000)
        expect(target.bestRace).toBe(84000)
    })

    it('non aggiorna se il candidato è peggiore', () => {
        const target: TrackBestTimes = { bestQualy: null, bestRace: 84000, bestAvgRace: null }
        updateBestTime(target, 'bestRace', 85000)
        expect(target.bestRace).toBe(84000)
    })

    it('non aggiorna per undefined', () => {
        const target: TrackBestTimes = { bestQualy: 83000, bestRace: null, bestAvgRace: null }
        updateBestTime(target, 'bestQualy', undefined)
        expect(target.bestQualy).toBe(83000)
    })

    it('non aggiorna per 0', () => {
        const target: TrackBestTimes = { bestQualy: 83000, bestRace: null, bestAvgRace: null }
        updateBestTime(target, 'bestQualy', 0)
        expect(target.bestQualy).toBe(83000)
    })

    it('aggiorna bestAvgRace', () => {
        const target: TrackBestTimes = { bestQualy: null, bestRace: null, bestAvgRace: 85000 }
        updateBestTime(target, 'bestAvgRace', 84000)
        expect(target.bestAvgRace).toBe(84000)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// mergePendingBestsByTrack
// ─────────────────────────────────────────────────────────────────────────────
describe('mergePendingBestsByTrack', () => {
    it('aggiunge un nuovo tracciato dalla sessione pending', () => {
        const session = makeSession({ track: 'monza', bestQualy: 83456 })
        const result = mergePendingBestsByTrack({}, [session])
        expect(result['monza']).toBeDefined()
        expect(result['monza'].bestQualy).toBe(83456)
    })

    it('migliora un best esistente', () => {
        const base = { monza: { bestQualy: 84000, bestRace: null, bestAvgRace: null } }
        const session = makeSession({ track: 'monza', bestQualy: 83000 })
        const result = mergePendingBestsByTrack(base, [session])
        expect(result['monza'].bestQualy).toBe(83000)
    })

    it('non peggiora un best esistente', () => {
        const base = { monza: { bestQualy: 83000, bestRace: null, bestAvgRace: null } }
        const session = makeSession({ track: 'monza', bestQualy: 84000 })
        const result = mergePendingBestsByTrack(base, [session])
        expect(result['monza'].bestQualy).toBe(83000)
    })

    it('salta sessioni non GT3', () => {
        const session = makeSession({ track: 'monza', car: 'porsche_718_cayman_gt4', bestQualy: 83456 })
        const result = mergePendingBestsByTrack({}, [session])
        expect(result['monza']).toBeUndefined()
    })

    it('salta sessioni senza track', () => {
        const session = makeSession({ track: '', bestQualy: 83456 })
        const result = mergePendingBestsByTrack({}, [session])
        expect(Object.keys(result)).toHaveLength(0)
    })

    it('gestisce array vuoto di sessioni', () => {
        const base = { monza: { bestQualy: 83000, bestRace: null, bestAvgRace: null } }
        const result = mergePendingBestsByTrack(base, [])
        expect(result['monza'].bestQualy).toBe(83000)
    })

    it('non muta l\'oggetto base', () => {
        const base = { monza: { bestQualy: 84000, bestRace: null, bestAvgRace: null } }
        const session = makeSession({ track: 'monza', bestQualy: 83000 })
        mergePendingBestsByTrack(base, [session])
        expect(base['monza'].bestQualy).toBe(84000)
    })

    it('elabora più sessioni sullo stesso tracciato tenendo il migliore', () => {
        const s1 = makeSession({ track: 'spa', bestQualy: 136000 })
        const s2 = { ...makeSession({ track: 'spa', bestQualy: 134000 }), sessionId: 'sess-002' }
        const result = mergePendingBestsByTrack({}, [s1, s2])
        expect(result['spa'].bestQualy).toBe(134000)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// mergePendingOverviewBestsByTrack
// ─────────────────────────────────────────────────────────────────────────────
describe('mergePendingOverviewBestsByTrack', () => {
    it('aggiunge best con grip dalla sessione pending', () => {
        const session = makeSession({ track: 'monza', bestQualy: 83456, grip: 'Optimum' })
        const result = mergePendingOverviewBestsByTrack({}, [session])
        expect(result['monza']?.bestQualy).toBe(83456)
        expect(result['monza']?.bestQualyGrip).toBe('Optimum')
    })

    it('salta sessioni non GT3', () => {
        const session = makeSession({ track: 'monza', car: 'porsche_718_cayman_gt4', bestQualy: 83456 })
        const result = mergePendingOverviewBestsByTrack({}, [session])
        expect(result['monza']).toBeUndefined()
    })

    it('non muta l\'oggetto base', () => {
        const base: Record<string, TrackBestTimes> = {}
        const session = makeSession({ track: 'monza', bestRace: 84000 })
        mergePendingOverviewBestsByTrack(base, [session])
        expect(base['monza']).toBeUndefined()
    })

    it('gestisce best_by_grip mancante nella summary', () => {
        const session = makeSession({ track: 'monza' })
        ;(session.summary as any).best_by_grip = undefined
        const result = mergePendingOverviewBestsByTrack({}, [session])
        // non crasha, valore rimane null
        expect(result['monza']?.bestQualy ?? null).toBeNull()
    })

    it('gestisce array vuoto di sessioni', () => {
        const base = { monza: { bestQualy: 83000, bestQualyGrip: 'Optimum', bestRace: null, bestRaceGrip: null, bestAvgRace: null, bestAvgRaceGrip: null } }
        const result = mergePendingOverviewBestsByTrack(base, [])
        expect(result['monza'].bestQualy).toBe(83000)
    })

    it('scansiona tutti i grip SCAN_ORDER per la sessione', () => {
        const session = makeSession({ track: 'spa', grip: 'Wet', bestRace: 140000 })
        ;(session.summary as any).best_by_grip = { Wet: { bestRace: 140000 }, Optimum: { bestRace: 136000 } }
        const result = mergePendingOverviewBestsByTrack({}, [session])
        // Optimum deve essere scelto (valore più basso)
        expect(result['spa']?.bestRace).toBe(136000)
        expect(result['spa']?.bestRaceGrip).toBe('Optimum')
    })
})
