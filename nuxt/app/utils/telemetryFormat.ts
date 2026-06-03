/**
 * telemetryFormat.ts
 * ==================
 * Utility pure functions per la formattazione dei dati telemetria ACC.
 * Estrato da useTelemetryData.ts — nessuna dipendenza Vue/Firebase.
 *
 * Importabile direttamente dai servizi senza caricare il composable pesante.
 */

// === CAR CATEGORIES ===

/** Categorie auto ACC per separare i best storici */
export const CAR_CATEGORIES = ['GT3', 'GT4', 'CUP', 'GT2', 'ST', 'TCX'] as const
export type CarCategory = typeof CAR_CATEGORIES[number]

export const SESSION_TYPES = {
    PRACTICE: 0,
    QUALIFY: 1,
    RACE: 2,
} as const

export type SessionType = 'race' | 'qualify' | 'practice'

/**
 * Ricava la categoria auto dal nome modello.
 * Pattern matching sul suffisso della stringa car.
 */
export function getCarCategory(car: string): CarCategory {
    if (!car) return 'GT3'
    const lower = car.toLowerCase()

    // GT4 - production-based
    if (lower.includes('gt4')) return 'GT4'

    // CUP - Porsche Cup cars
    if (lower.includes('cup')) return 'CUP'

    // GT2 - GT2 class cars
    if (lower.includes('gt2') || lower.includes('935')) return 'GT2'

    // ST - Lamborghini Super Trofeo
    if (lower.includes('_st') || lower.includes('supertrofeo') || lower.includes('super_trofeo')) return 'ST'

    // TCX - Mercedes AMG GT2 (special class)
    if (lower.includes('tcx')) return 'TCX'

    // Default: GT3 (most common)
    return 'GT3'
}

export function getSessionTypeLabel(type: number): SessionType {
    switch (type) {
        case 0: return 'practice'
        case 1: return 'qualify'
        case 2: return 'race'
        default: return 'practice'
    }
}

export function getSessionTypeDisplay(type: number): string {
    switch (type) {
        case 0: return 'PRACTICE'
        case 1: return 'QUALIFY'
        case 2: return 'RACE'
        default: return 'PRACTICE'
    }
}

// === FORMAT HELPERS ===

/** Tempo giro massimo ragionevole (10 minuti). Valori superiori sono trattati come non validi. */
export const MAX_REASONABLE_LAP_MS = 600000

/**
 * Formatta millisecondi come tempo giro: "1:23.456"
 * Restituisce "--:--.---" se il valore è nullo, zero o non valido.
 */
export function formatLapTime(ms: number | null | undefined): string {
    if (!ms || ms <= 0 || ms > MAX_REASONABLE_LAP_MS) return '--:--.---'
    const msInt = Math.round(ms)
    const minutes = Math.floor(msInt / 60000)
    const seconds = Math.floor((msInt % 60000) / 1000)
    const millis = msInt % 1000
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

/**
 * Formatta millisecondi come tempo di guida: "2h 30m" o "45m"
 */
export function formatDriveTime(ms: number): string {
    if (!ms || ms <= 0) return '0h 0m'
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    if (hours > 0) {
        return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
}

/**
 * Converte nome auto snake_case in leggibile: "amr_v8_vantage_gt3" → "AMR V8 Vantage GT3"
 */
const CAR_ACRONYMS = new Set(['amr', 'bmw', 'amg', 'ktm', 'nsx', 'sls', 'gts', 'wrt', 'grt', 'hpp'])

export function formatCarName(car: string): string {
    if (!car) return 'Unknown'
    return car
        .split('_')
        .map((word) => {
            if (word.match(/^gt\d$/i)) return word.toUpperCase()
            if (word.length <= 2) return word.toUpperCase()
            if (CAR_ACRONYMS.has(word.toLowerCase())) return word.toUpperCase()
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        })
        .join(' ')
}

/**
 * Converte nome pista snake_case in leggibile: "spa_francorchamps" → "Spa Francorchamps"
 */
export function formatTrackName(track: string): string {
    if (!track) return 'Unknown'
    return track
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
}

/**
 * Parsa una stringa data telemetria in un oggetto Date locale.
 * I timestamp del logger sono naive (senza timezone): vengono trattati come ora locale.
 * Le stringhe con timezone esplicita (Z, +HH:MM) usano il parsing nativo.
 */
export function parseTelemetryDate(dateStr: string): Date | null {
    if (!dateStr) return null

    // Timezone esplicita: parsing nativo
    if (/[zZ]|[+\-]\d{2}:\d{2}$/.test(dateStr)) {
        const zoned = new Date(dateStr)
        return Number.isNaN(zoned.getTime()) ? null : zoned
    }

    // Logger: datetime naive locale
    const match = dateStr.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/
    )
    if (match) {
        const [, y, m, d, hh, mm, ss = '0', fraction = '0'] = match
        const ms = Number(fraction.padEnd(3, '0').slice(0, 3))
        const local = new Date(
            Number(y),
            Number(m) - 1,
            Number(d),
            Number(hh),
            Number(mm),
            Number(ss),
            ms
        )
        return Number.isNaN(local.getTime()) ? null : local
    }

    const fallback = new Date(dateStr)
    return Number.isNaN(fallback.getTime()) ? null : fallback
}

/**
 * Converte una Date in chiave stringa "YYYY-MM-DD" (locale).
 */
export function formatLocalDateKey(date: Date): string {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Formatta una data come "15 Mag 2024"
 */
export function formatDate(dateStr: string): string {
    if (!dateStr) return '-'
    const date = parseTelemetryDate(dateStr)
    if (!date) return '-'
    const day = date.getDate()
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Formatta una data come "15 MAGGIO 2024"
 */
export function formatDateFull(dateStr: string): string {
    if (!dateStr) return '-'
    const date = parseTelemetryDate(dateStr)
    if (!date) return '-'
    const day = date.getDate()
    const months = [
        'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
        'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'
    ]
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Formatta una data come orario "HH:MM"
 */
export function formatTime(dateStr: string): string {
    if (!dateStr) return '-'
    const date = parseTelemetryDate(dateStr)
    if (!date) return '-'
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
}
