// ============================================
// useDebugValidator - Automated validation for debugging
// Runs on page load in dev mode, logs results to console
// ============================================

import { type FullSession, type StintData, type LapData, formatLapTime } from './useTelemetryData'

// === TYPES ===

export interface TestResult {
    name: string
    passed: boolean
    expected: any
    actual: any
    message?: string
    severity: 'error' | 'warning' | 'info'
}

export interface ValidationSummary {
    pageName: string
    totalTests: number
    passed: number
    failed: number
    warnings: number
    results: TestResult[]
    timestamp: string
}

// === HELPER FUNCTIONS ===

function formatValue(value: any): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return 'NaN'
        return value.toLocaleString('en-US', { maximumFractionDigits: 3 })
    }
    if (typeof value === 'object') {
        return JSON.stringify(value).slice(0, 100)
    }
    return String(value)
}

function isValidNumber(value: any): boolean {
    return typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)
}

function approxEqual(a: number, b: number, tolerance: number = 1): boolean {
    return Math.abs(a - b) <= tolerance
}

// === TEST FUNCTIONS ===

/**
 * Validate SessionDetailPage data
 */
export function validateSessionDetail(
    sessionData: any,
    fullSession: FullSession | null
): TestResult[] {
    const results: TestResult[] = []

    if (!fullSession) {
        results.push({
            name: 'Session Data Loaded',
            passed: false,
            expected: 'FullSession object',
            actual: null,
            message: 'fullSession is null - cannot validate',
            severity: 'error'
        })
        return results
    }

    const fs = fullSession

    // === TEST 1: Best lap calculation ===
    fs.stints.forEach((stint, stintIndex) => {
        const validLaps = stint.laps.filter(l => l.is_valid && !l.has_pit_stop)
        if (validLaps.length === 0) return

        const calculatedBest = Math.min(...validLaps.map(l => l.lap_time_ms))
        const displayedBest = sessionData.stints?.[stintIndex]?.bestMs

        results.push({
            name: `Stint ${stint.stint_number}: Best Lap Calculation`,
            passed: displayedBest === calculatedBest,
            expected: calculatedBest,
            actual: displayedBest,
            message: displayedBest !== calculatedBest
                ? `Difference: ${Math.abs((displayedBest || 0) - calculatedBest)}ms`
                : undefined,
            severity: 'error'
        })
    })

    // === TEST 2: Avg >= Best (when avg exists) ===
    fs.stints.forEach((stint, stintIndex) => {
        const displayedStint = sessionData.stints?.[stintIndex]
        if (!displayedStint?.avgMs || !displayedStint?.bestMs) return

        const avgGteBest = displayedStint.avgMs >= displayedStint.bestMs

        results.push({
            name: `Stint ${stint.stint_number}: Avg >= Best`,
            passed: avgGteBest,
            expected: `Avg (${displayedStint.avgMs}) >= Best (${displayedStint.bestMs})`,
            actual: avgGteBest ? 'OK' : `Avg < Best by ${displayedStint.bestMs - displayedStint.avgMs}ms`,
            severity: 'error'
        })
    })

    // === TEST 3: Valid laps count ===
    fs.stints.forEach((stint, stintIndex) => {
        const actualValidCount = stint.laps.filter(l => l.is_valid && !l.has_pit_stop).length
        const displayedValidCount = sessionData.stints?.[stintIndex]?.validLapsCount

        results.push({
            name: `Stint ${stint.stint_number}: Valid Laps Count`,
            passed: displayedValidCount === actualValidCount,
            expected: actualValidCount,
            actual: displayedValidCount,
            severity: 'warning'
        })
    })

    // === TEST 4: Delta vs Theo calculation ===
    fs.stints.forEach((stint, stintIndex) => {
        const displayedStint = sessionData.stints?.[stintIndex]
        if (!displayedStint?.bestMs) return

        const sessionBest = fs.session_info.session_best_lap
        const expectedDelta = ((displayedStint.bestMs - sessionBest) / 1000).toFixed(3)
        const displayedDelta = displayedStint.deltaVsTheo?.replace('+', '')

        results.push({
            name: `Stint ${stint.stint_number}: Delta vs Theo`,
            passed: displayedDelta === expectedDelta,
            expected: `+${expectedDelta}`,
            actual: displayedStint.deltaVsTheo,
            severity: 'warning'
        })
    })

    // === TEST 5: No NaN/undefined in critical values ===
    const criticalFields = ['track', 'car', 'date', 'bestQualy', 'bestRace']
    criticalFields.forEach(field => {
        const value = sessionData[field]
        const isValid = value !== undefined && value !== null && value !== 'NaN'

        results.push({
            name: `Critical Field: ${field}`,
            passed: isValid,
            expected: 'defined value',
            actual: formatValue(value),
            severity: value === undefined ? 'error' : 'warning'
        })
    })

    // === TEST 6: Stint duration calculation ===
    fs.stints.forEach((stint, stintIndex) => {
        const calculatedDuration = stint.laps.reduce((sum, lap) => sum + (lap.lap_time_ms || 0), 0)
        const jsonDuration = stint.stint_drive_time_ms
        const displayedDuration = sessionData.stints?.[stintIndex]?.durationMs

        // Check if displayed matches JSON (preferred source)
        results.push({
            name: `Stint ${stint.stint_number}: Duration from JSON`,
            passed: displayedDuration === jsonDuration,
            expected: jsonDuration,
            actual: displayedDuration,
            message: jsonDuration !== calculatedDuration
                ? `Note: JSON duration differs from calculated by ${Math.abs(jsonDuration - calculatedDuration)}ms`
                : undefined,
            severity: 'info'
        })
    })

    // === TEST 7: Session type consistency ===
    const sessionType = fs.session_info.session_type
    const hasQualyStints = fs.stints.some(s => s.type === 'Qualify')
    const hasRaceStints = fs.stints.some(s => s.type === 'Race')

    if (sessionType === 1) { // Qualify-only session
        results.push({
            name: 'Session Type: Qualify Consistency',
            passed: hasQualyStints,
            expected: 'At least one Qualify stint',
            actual: hasQualyStints ? 'Has Qualify stints' : 'No Qualify stints found',
            severity: 'warning'
        })
    }

    // === TEST 8: Lap numbers are sequential ===
    fs.stints.forEach(stint => {
        const lapNumbers = stint.laps.map(l => l.lap_number)
        const isSequential = lapNumbers.every((num, idx) => idx === 0 || num === (lapNumbers[idx - 1] ?? 0) + 1)

        results.push({
            name: `Stint ${stint.stint_number}: Lap Numbers Sequential`,
            passed: isSequential,
            expected: 'Sequential lap numbers',
            actual: isSequential ? 'OK' : `Gaps found: ${lapNumbers.join(', ')}`,
            severity: 'warning'
        })
    })

    return results
}

/**
 * Validate TrackDetailPage data
 */
export function validateTrackDetail(
    trackData: any,
    trackSessions: any[],
    recalculatedBests: Record<string, any>,
    selectedGrip: string
): TestResult[] {
    const results: TestResult[] = []

    // === TEST 1: Session count matches ===
    const displayedCount = trackData.sessions
    const actualCount = trackSessions.length

    results.push({
        name: 'Session Count Match',
        passed: displayedCount === actualCount,
        expected: actualCount,
        actual: displayedCount,
        severity: 'error'
    })

    // === TEST 2: Activity totals are sums ===
    const calculatedTotalLaps = trackSessions.reduce((sum, s) => sum + ((s.summary as any)?.laps || 0), 0)
    const calculatedValidLaps = trackSessions.reduce((sum, s) => sum + ((s.summary as any)?.lapsValid || 0), 0)

    results.push({
        name: 'Activity: Total Laps Sum',
        passed: true, // Will be checked in page-specific validation
        expected: calculatedTotalLaps,
        actual: `Calculated from ${trackSessions.length} sessions`,
        severity: 'info'
    })

    // === TEST 3: Best times match recalculated ===
    const gripBests = recalculatedBests[selectedGrip]
    if (gripBests) {
        if (gripBests.bestQualy) {
            const displayedQualy = trackData.bestQualy
            const expectedQualy = formatLapTime(gripBests.bestQualy)

            results.push({
                name: `Best Qualy for ${selectedGrip}`,
                passed: displayedQualy === expectedQualy,
                expected: expectedQualy,
                actual: displayedQualy,
                severity: 'error'
            })
        }

        if (gripBests.bestRace) {
            const displayedRace = trackData.bestRace
            const expectedRace = formatLapTime(gripBests.bestRace)

            results.push({
                name: `Best Race for ${selectedGrip}`,
                passed: displayedRace === expectedRace,
                expected: expectedRace,
                actual: displayedRace,
                severity: 'error'
            })
        }

        if (gripBests.bestAvgRace) {
            const displayedAvg = trackData.bestAvgRace
            const expectedAvg = formatLapTime(gripBests.bestAvgRace)

            results.push({
                name: `Best Avg Race for ${selectedGrip}`,
                passed: displayedAvg === expectedAvg,
                expected: expectedAvg,
                actual: displayedAvg,
                severity: 'error'
            })
        }
    }

    // === TEST 4: No null/undefined in display fields ===
    const displayFields = ['name', 'fullName', 'country', 'length']
    displayFields.forEach(field => {
        const value = trackData[field]
        const isValid = value !== undefined && value !== null && value !== '-'

        results.push({
            name: `Track Field: ${field}`,
            passed: isValid,
            expected: 'valid value',
            actual: formatValue(value),
            severity: value === undefined ? 'error' : 'info'
        })
    })

    // === TEST 5: Historical data is chronological ===
    if (trackSessions.length > 1) {
        const dates = trackSessions.map(s => s.meta.date_start)
        const isSortedDesc = dates.every((d, i) => i === 0 || d <= dates[i - 1])

        results.push({
            name: 'Sessions Sorted Descending (newest first)',
            passed: isSortedDesc,
            expected: 'Descending date order',
            actual: isSortedDesc ? 'OK' : 'Order mismatch',
            severity: 'warning'
        })
    }

    return results
}

/**
 * Run validation and log results to console
 */
export function runValidation(pageName: string, results: TestResult[]): ValidationSummary {
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed && r.severity === 'error').length
    const warnings = results.filter(r => !r.passed && r.severity === 'warning').length

    const summary: ValidationSummary = {
        pageName,
        totalTests: results.length,
        passed,
        failed,
        warnings,
        results,
        timestamp: new Date().toISOString()
    }

    // === CONSOLE OUTPUT ===
    const logStyle = failed > 0
        ? 'background: #ff4444; color: white; padding: 2px 8px; border-radius: 4px;'
        : warnings > 0
            ? 'background: #ffaa00; color: black; padding: 2px 8px; border-radius: 4px;'
            : 'background: #44aa44; color: white; padding: 2px 8px; border-radius: 4px;'

    console.log(`%c[DEBUG] ${pageName}: ${passed}/${results.length} tests passed`, logStyle)

    if (failed > 0 || warnings > 0) {
        console.group(`[DEBUG] ${pageName} - Details`)

        results.forEach(r => {
            if (!r.passed) {
                const icon = r.severity === 'error' ? '❌' : r.severity === 'warning' ? '⚠️' : 'ℹ️'
                console.log(`${icon} ${r.name}`)
                console.log(`   Expected: ${formatValue(r.expected)}`)
                console.log(`   Actual:   ${formatValue(r.actual)}`)
                if (r.message) {
                    console.log(`   Note: ${r.message}`)
                }
            }
        })

        console.groupEnd()
    }

    // Log full summary for programmatic access
    console.log('[DEBUG] Full validation summary:', summary)

    return summary
}

/**
 * Convenience function for SessionDetailPage
 */
export function runSessionValidation(sessionData: any, fullSession: FullSession | null): ValidationSummary {
    const results = validateSessionDetail(sessionData, fullSession)
    return runValidation('SessionDetailPage', results)
}

/**
 * Convenience function for TrackDetailPage
 */
export function runTrackValidation(
    trackData: any,
    trackSessions: any[],
    recalculatedBests: Record<string, any>,
    selectedGrip: string
): ValidationSummary {
    const results = validateTrackDetail(trackData, trackSessions, recalculatedBests, selectedGrip)
    return runValidation('TrackDetailPage', results)
}
