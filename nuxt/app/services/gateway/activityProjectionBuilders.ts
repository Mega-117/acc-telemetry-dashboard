import { SESSION_TYPES } from '~/utils/telemetryFormat'
import type { SessionDocument } from '~/composables/useTelemetryData'
import type { OverviewProjection } from '~/types/overviewProjections'
import {
    buildRecentActivityBuckets,
    getActivityBucketForSessionType,
    getRecentActivityDateKeys,
    getTelemetryActivityDateKey
} from '~/services/telemetry/activityProjectionService'

export function buildActivity7dFromSessionIndex(sessionIndex: any): OverviewProjection['activity7d'] {
    const sourceRows = Array.isArray(sessionIndex?.activity7d?.byDay) ? sessionIndex.activity7d.byDay : []
    const byDate = new Map<string, any>()
    for (const row of sourceRows) {
        if (row?.date) byDate.set(row.date, row)
    }

    return buildRecentActivityBuckets(7).map((bucket) => {
        const row = byDate.get(bucket.date) || {}
        return {
            date: bucket.date,
            dateLabel: bucket.dateLabel,
            day: bucket.day,
            practice: Number(row.P || row.practice || 0),
            qualify: Number(row.Q || row.qualify || 0),
            race: Number(row.R || row.race || 0)
        }
    })
}

export function buildActivityTotalsFromSessionIndex(sessionIndex: any): OverviewProjection['activityTotals'] {
    const activity = sessionIndex?.activity7d || {}
    return {
        practice: {
            minutes: Number(activity.practice?.minutes || 0),
            sessions: Number(activity.practice?.sessions || 0)
        },
        qualify: {
            minutes: Number(activity.qualify?.minutes || 0),
            sessions: Number(activity.qualify?.sessions || 0)
        },
        race: {
            minutes: Number(activity.race?.minutes || 0),
            sessions: Number(activity.race?.sessions || 0)
        }
    }
}

export function sumActivityDataMinutes(activity7d: OverviewProjection['activity7d']): number {
    return activity7d.reduce((sum, row) => sum + Number(row.practice || 0) + Number(row.qualify || 0) + Number(row.race || 0), 0)
}

export function sumActivityTotalMinutes(activityTotals: OverviewProjection['activityTotals']): number {
    return Number(activityTotals.practice.minutes || 0)
        + Number(activityTotals.qualify.minutes || 0)
        + Number(activityTotals.race.minutes || 0)
}

export function isActivityProjectionInconsistent(
    activity7d: OverviewProjection['activity7d'],
    activityTotals: OverviewProjection['activityTotals']
): boolean {
    return sumActivityDataMinutes(activity7d) !== sumActivityTotalMinutes(activityTotals)
}

export function overlayPendingActivity(
    activity7d: OverviewProjection['activity7d'],
    activityTotals: OverviewProjection['activityTotals'],
    pendingSessions: SessionDocument[]
): { activity7d: OverviewProjection['activity7d']; activityTotals: OverviewProjection['activityTotals'] } {
    const resultData = activity7d.map((row) => ({ ...row }))
    const resultTotals = {
        practice: { ...activityTotals.practice },
        qualify: { ...activityTotals.qualify },
        race: { ...activityTotals.race }
    }

    const dateKeys = getRecentActivityDateKeys(7)

    for (const session of pendingSessions) {
        const minutes = Math.round(Number(session.summary?.totalTime || 0) / 60000)
        const dateKey = getTelemetryActivityDateKey(session.meta?.date_start)
        if (!dateKey) continue
        const index = dateKeys.indexOf(dateKey)
        const sessionType = session.meta?.session_type
        const bucket = getActivityBucketForSessionType(sessionType, SESSION_TYPES)
        if (!bucket) continue
        resultTotals[bucket].minutes += minutes
        resultTotals[bucket].sessions += 1
        const dayRow = index >= 0 ? resultData[index] : null
        if (dayRow) {
            dayRow[bucket] += minutes
        }
    }

    return { activity7d: resultData, activityTotals: resultTotals }
}
