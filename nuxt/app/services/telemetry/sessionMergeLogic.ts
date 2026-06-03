// Re-export merge logic for backward compatibility.
// All implementations live in telemetryMergeService.ts.
export {
    normalizeTrackKey,
    buildLogicalSessionKey,
    dedupeCloudSessions,
    mergeSessionLocalPreferred,
    mergeSessionsDeterministic,
    mergeLocalFirst,
    mergePendingLocal,
} from '~/services/telemetry/telemetryMergeService'
