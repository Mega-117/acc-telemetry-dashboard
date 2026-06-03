import { describe, it, expect } from 'vitest'
import {
    formatLapTime,
    formatDriveTime,
    formatCarName,
    formatTrackName,
    formatDate,
    formatDateFull,
    formatTime,
    parseTelemetryDate,
    formatLocalDateKey,
    getCarCategory,
    getSessionTypeLabel,
    getSessionTypeDisplay,
    MAX_REASONABLE_LAP_MS,
    CAR_CATEGORIES,
} from '~/utils/telemetryFormat'

// ─────────────────────────────────────────────────────────────────────────────
// formatLapTime
// ─────────────────────────────────────────────────────────────────────────────
describe('formatLapTime', () => {
    it('formatta ms come m:ss.mmm', () => {
        expect(formatLapTime(83456)).toBe('1:23.456')
    })

    it('padding corretto: secondi e millis sotto 10', () => {
        expect(formatLapTime(61005)).toBe('1:01.005')
    })

    it('restituisce -- per null', () => {
        expect(formatLapTime(null)).toBe('--:--.---')
    })

    it('restituisce -- per 0', () => {
        expect(formatLapTime(0)).toBe('--:--.---')
    })

    it('restituisce -- per negativo', () => {
        expect(formatLapTime(-100)).toBe('--:--.---')
    })

    it('restituisce -- per valore oltre MAX_REASONABLE_LAP_MS', () => {
        expect(formatLapTime(MAX_REASONABLE_LAP_MS + 1)).toBe('--:--.---')
    })

    it('accetta esattamente MAX_REASONABLE_LAP_MS (10 minuti)', () => {
        expect(formatLapTime(MAX_REASONABLE_LAP_MS)).toBe('10:00.000')
    })

    it('arrotonda ms interi senza artefatti decimali', () => {
        // 90000.6 deve arrotondare senza produrre ".600" vs ".601"
        const result = formatLapTime(90000)
        expect(result).toBe('1:30.000')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatDriveTime
// ─────────────────────────────────────────────────────────────────────────────
describe('formatDriveTime', () => {
    it('formato con ore e minuti', () => {
        expect(formatDriveTime(5400000)).toBe('1h 30m')
    })

    it('solo minuti se < 1h', () => {
        expect(formatDriveTime(2700000)).toBe('45m')
    })

    it('0h 0m per 0', () => {
        expect(formatDriveTime(0)).toBe('0h 0m')
    })

    it('ore esatte senza minuti residui', () => {
        expect(formatDriveTime(3600000)).toBe('1h 0m')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatCarName
// ─────────────────────────────────────────────────────────────────────────────
describe('formatCarName', () => {
    it('converte snake_case in title case', () => {
        expect(formatCarName('ferrari_296_gt3')).toBe('Ferrari 296 GT3')
    })

    it('mantiene GT3 uppercase', () => {
        expect(formatCarName('amr_v8_vantage_gt3')).toBe('AMR V8 Vantage GT3')
    })

    it('mantiene GT4 uppercase', () => {
        expect(formatCarName('porsche_718_cayman_gt4')).toBe('Porsche 718 Cayman GT4')
    })

    it('restituisce Unknown per stringa vuota', () => {
        expect(formatCarName('')).toBe('Unknown')
    })

    it('parole brevi (≤2 char) uppercase', () => {
        // "v8" ha 2 char → uppercase
        expect(formatCarName('amr_v8_vantage_gt3')).toContain('V8')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatTrackName
// ─────────────────────────────────────────────────────────────────────────────
describe('formatTrackName', () => {
    it('converte snake_case in title case', () => {
        expect(formatTrackName('spa_francorchamps')).toBe('Spa Francorchamps')
    })

    it('una parola sola', () => {
        expect(formatTrackName('monza')).toBe('Monza')
    })

    it('restituisce Unknown per stringa vuota', () => {
        expect(formatTrackName('')).toBe('Unknown')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getCarCategory
// ─────────────────────────────────────────────────────────────────────────────
describe('getCarCategory', () => {
    it('GT3 di default', () => {
        expect(getCarCategory('ferrari_296_gt3')).toBe('GT3')
    })

    it('GT4 se contiene gt4', () => {
        expect(getCarCategory('porsche_718_cayman_gt4')).toBe('GT4')
    })

    it('CUP se contiene cup', () => {
        expect(getCarCategory('porsche_991ii_gt3_cup')).toBe('CUP')
    })

    it('GT2 se contiene gt2', () => {
        expect(getCarCategory('ferrari_gt2')).toBe('GT2')
    })

    it('GT2 per la Porsche 935', () => {
        expect(getCarCategory('porsche_935')).toBe('GT2')
    })

    it('ST per Super Trofeo', () => {
        expect(getCarCategory('lamborghini_supertrofeo')).toBe('ST')
    })

    it('GT3 per stringa vuota', () => {
        expect(getCarCategory('')).toBe('GT3')
    })

    it('tutte le categorie sono in CAR_CATEGORIES', () => {
        const cats: string[] = [...CAR_CATEGORIES]
        expect(cats).toContain(getCarCategory('ferrari_296_gt3'))
        expect(cats).toContain(getCarCategory('ferrari_gt4'))
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getSessionTypeLabel / getSessionTypeDisplay
// ─────────────────────────────────────────────────────────────────────────────
describe('getSessionTypeLabel', () => {
    it('0 → practice', () => expect(getSessionTypeLabel(0)).toBe('practice'))
    it('1 → qualify', () => expect(getSessionTypeLabel(1)).toBe('qualify'))
    it('2 → race', () => expect(getSessionTypeLabel(2)).toBe('race'))
    it('default → practice', () => expect(getSessionTypeLabel(99)).toBe('practice'))
})

describe('getSessionTypeDisplay', () => {
    it('0 → PRACTICE', () => expect(getSessionTypeDisplay(0)).toBe('PRACTICE'))
    it('1 → QUALIFY', () => expect(getSessionTypeDisplay(1)).toBe('QUALIFY'))
    it('2 → RACE', () => expect(getSessionTypeDisplay(2)).toBe('RACE'))
})

// ─────────────────────────────────────────────────────────────────────────────
// parseTelemetryDate + formatLocalDateKey
// ─────────────────────────────────────────────────────────────────────────────
describe('parseTelemetryDate', () => {
    it('parsa datetime naive locale correttamente', () => {
        const d = parseTelemetryDate('2024-05-15T10:30:00')
        expect(d).not.toBeNull()
        expect(d!.getFullYear()).toBe(2024)
        expect(d!.getMonth()).toBe(4) // maggio (0-indexed)
        expect(d!.getDate()).toBe(15)
        expect(d!.getHours()).toBe(10)
    })

    it('parsa datetime con Z come UTC', () => {
        const d = parseTelemetryDate('2024-05-15T10:30:00.000Z')
        expect(d).not.toBeNull()
        expect(d!.getUTCFullYear()).toBe(2024)
    })

    it('restituisce null per stringa vuota', () => {
        expect(parseTelemetryDate('')).toBeNull()
    })

    it('restituisce null per stringa non valida', () => {
        expect(parseTelemetryDate('not-a-date')).toBeNull()
    })
})

describe('formatLocalDateKey', () => {
    it('produce YYYY-MM-DD da Date locale', () => {
        const d = new Date(2024, 4, 15) // maggio 2024 (0-indexed)
        expect(formatLocalDateKey(d)).toBe('2024-05-15')
    })

    it('padding corretto per mesi e giorni sotto 10', () => {
        const d = new Date(2024, 0, 5) // gennaio 5
        expect(formatLocalDateKey(d)).toBe('2024-01-05')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatDate / formatDateFull / formatTime
// ─────────────────────────────────────────────────────────────────────────────
describe('formatDate', () => {
    it('formato "15 Mag 2024"', () => {
        expect(formatDate('2024-05-15T10:00:00')).toBe('15 Mag 2024')
    })

    it('restituisce - per stringa vuota', () => {
        expect(formatDate('')).toBe('-')
    })
})

describe('formatDateFull', () => {
    it('formato "15 MAGGIO 2024"', () => {
        expect(formatDateFull('2024-05-15T10:00:00')).toBe('15 MAGGIO 2024')
    })

    it('restituisce - per stringa vuota', () => {
        expect(formatDateFull('')).toBe('-')
    })
})

describe('formatTime', () => {
    it('formato "HH:MM"', () => {
        expect(formatTime('2024-05-15T10:30:00')).toBe('10:30')
    })

    it('padding zero per ore e minuti sotto 10', () => {
        expect(formatTime('2024-05-15T09:05:00')).toBe('09:05')
    })

    it('restituisce - per stringa vuota', () => {
        expect(formatTime('')).toBe('-')
    })
})
