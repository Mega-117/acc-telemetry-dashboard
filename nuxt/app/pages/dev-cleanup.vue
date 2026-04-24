<script setup lang="ts">
// ============================================
// DEV Cleanup Page - Remove zero-lap ghosts and duplicate sessions
// ============================================

import { ref, computed, onMounted } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  doc,
  getDocs,
  deleteDoc,
  collection,
  query,
  setDoc
} from 'firebase/firestore'
import { db } from '~/config/firebase'

const SESSION_INDEX_MAX_ITEMS = 200
const BEST_RULES_VERSION = 3

const { currentUser } = useFirebaseAuth()

const isLoading = ref(false)
const sessions = ref<any[]>([])
const duplicateGroups = ref<Map<string, any[]>>(new Map())
const zeroLapSessions = ref<any[]>([])
const deletedCount = ref(0)
const error = ref<string | null>(null)

function isOldFormat(sessionId: string): boolean {
  return /^\d{13}_/.test(sessionId)
}

function getGroupKey(session: any): string {
  const track = (session.meta?.track || 'unknown').toLowerCase().replace(/\s+/g, '_')
  const dateStart = session.meta?.date_start || ''
  const dateKey = dateStart.split(':').slice(0, 2).join(':')
  return `${dateKey}_${track}`
}

function getSessionDate(session: any): string {
  return session.meta?.date_start || ''
}

function getSessionTrack(session: any): string {
  return session.meta?.track || ''
}

function getSessionType(session: any): number {
  return session.meta?.session_type ?? 0
}

function getSessionLaps(session: any): number {
  return session.summary?.laps || 0
}

function buildUserIndexPayload(allSessions: any[]) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  let lastSessionDate: string | null = null
  let sessionsLast7Days = 0

  let practiceMinutes = 0
  let practiceCount = 0
  let qualifyMinutes = 0
  let qualifyCount = 0
  let raceMinutes = 0
  let raceCount = 0
  const activityByDay: Record<string, { P: number; Q: number; R: number }> = {}

  const tracksMap: Record<string, { track: string; sessions: number; lastPlayed: string }> = {}
  const sessionsList: Array<{
    id: string
    date: string
    track: string
    car: string
    type: number
    laps: number
    lapsValid: number
    bestLap: number | null
    totalTime: number
    stintCount: number
    bestQualyMs: number | null
    bestSessionRaceMs: number | null
    bestRaceMs: number | null
    bestRulesVersion: number
    grip?: string
    bestSessionRaceGrip?: string
  }> = []

  for (const session of allSessions) {
    const dateStart = getSessionDate(session)
    const track = getSessionTrack(session)
    const trackKey = track.toLowerCase()

    if (dateStart && (!lastSessionDate || dateStart > lastSessionDate)) {
      lastSessionDate = dateStart
    }

    if (dateStart >= sevenDaysAgoStr) {
      sessionsLast7Days++
      const totalMs = session.summary?.totalTime || 0
      const minutes = Math.round(totalMs / 60000)
      const dayKey = dateStart.substring(0, 10)

      if (!activityByDay[dayKey]) activityByDay[dayKey] = { P: 0, Q: 0, R: 0 }

      switch (getSessionType(session)) {
        case 0:
          practiceMinutes += minutes
          practiceCount++
          activityByDay[dayKey].P++
          break
        case 1:
          qualifyMinutes += minutes
          qualifyCount++
          activityByDay[dayKey].Q++
          break
        case 2:
          raceMinutes += minutes
          raceCount++
          activityByDay[dayKey].R++
          break
      }
    }

    if (trackKey) {
      if (!tracksMap[trackKey]) {
        tracksMap[trackKey] = { track, sessions: 0, lastPlayed: dateStart }
      }
      tracksMap[trackKey].sessions++
      if (dateStart > tracksMap[trackKey].lastPlayed) {
        tracksMap[trackKey].lastPlayed = dateStart
      }
    }

    const bestRulesVersion = Number(session.summary?.best_rules_version || 0)
    const raceRuleCompatible = bestRulesVersion >= BEST_RULES_VERSION

    sessionsList.push({
      id: session.sessionId,
      date: dateStart,
      track,
      car: session.meta?.car || '',
      type: getSessionType(session),
      laps: session.summary?.laps || 0,
      lapsValid: session.summary?.lapsValid || 0,
      bestLap: session.summary?.bestLap || null,
      totalTime: session.summary?.totalTime || 0,
      stintCount: session.summary?.stintCount || 0,
      bestQualyMs: session.summary?.best_qualy_ms || null,
      bestSessionRaceMs: session.summary?.best_session_race_ms || null,
      bestRaceMs: raceRuleCompatible ? (session.summary?.best_race_ms || null) : null,
      bestRulesVersion,
      bestSessionRaceGrip: session.summary?.best_session_race_conditions?.grip || undefined,
      grip: (raceRuleCompatible ? session.summary?.best_race_conditions?.grip : null) || session.summary?.best_qualy_conditions?.grip || undefined
    })
  }

  sessionsList.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return {
    stats: {
      totalSessions: allSessions.length,
      sessionsLast7Days,
      lastSessionDate,
      tracksCount: Object.keys(tracksMap).length,
      updatedAt: new Date().toISOString()
    },
    sessionIndex: {
      sessionsList: sessionsList.slice(0, SESSION_INDEX_MAX_ITEMS),
      totalSessions: allSessions.length,
      activity7d: {
        practice: { minutes: practiceMinutes, sessions: practiceCount },
        qualify: { minutes: qualifyMinutes, sessions: qualifyCount },
        race: { minutes: raceMinutes, sessions: raceCount },
        byDay: Object.entries(activityByDay).map(([date, counts]) => ({ date, ...counts }))
      },
      tracksSummary: Object.values(tracksMap),
      updatedAt: new Date().toISOString()
    }
  }
}

async function rebuildUserIndex(uid: string) {
  const sessionsRef = collection(db, `users/${uid}/sessions`)
  const snapshot = await getDocs(query(sessionsRef))
  const allSessions: any[] = []

  snapshot.forEach(docSnap => {
    allSessions.push({
      sessionId: docSnap.id,
      ...docSnap.data()
    })
  })

  await setDoc(doc(db, `users/${uid}`), buildUserIndexPayload(allSessions), { merge: true })
  console.log(`[CLEANUP] Rebuilt user index with ${allSessions.length} sessions`)
}

async function loadAndAnalyze() {
  if (!currentUser.value) return

  isLoading.value = true
  error.value = null

  try {
    const uid = currentUser.value.uid
    const sessionsRef = collection(db, `users/${uid}/sessions`)
    const snapshot = await getDocs(query(sessionsRef))

    const allSessions: any[] = []
    snapshot.forEach(docSnap => {
      allSessions.push({
        sessionId: docSnap.id,
        ...docSnap.data()
      })
    })

    sessions.value = allSessions
    zeroLapSessions.value = allSessions.filter(session => getSessionLaps(session) === 0)

    const groups = new Map<string, any[]>()
    for (const session of allSessions) {
      const key = getGroupKey(session)
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(session)
    }

    const duplicates = new Map<string, any[]>()
    for (const [key, group] of groups) {
      if (group.length > 1) {
        duplicates.set(key, group)
      }
    }

    duplicateGroups.value = duplicates
    console.log(`[CLEANUP] Found ${allSessions.length} sessions, ${duplicates.size} duplicate groups, ${zeroLapSessions.value.length} zero-lap ghosts`)
  } catch (e: any) {
    error.value = e.message
    console.error('[CLEANUP] Error:', e)
  } finally {
    isLoading.value = false
  }
}

async function deleteSessionEverywhere(uid: string, sessionId: string) {
  const chunksRef = collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`)
  const chunksSnap = await getDocs(chunksRef)
  for (const chunk of chunksSnap.docs) {
    await deleteDoc(chunk.ref)
  }

  const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
  await deleteDoc(sessionRef)
  deletedCount.value++
}

async function deleteZeroLapGhosts() {
  if (!currentUser.value) return

  const uid = currentUser.value.uid
  const toDelete = [...zeroLapSessions.value]
  if (toDelete.length === 0) return
  if (!confirm(`Delete ${toDelete.length} zero-lap ghost sessions from Firebase?`)) return

  isLoading.value = true
  error.value = null

  try {
    for (const session of toDelete) {
      try {
        await deleteSessionEverywhere(uid, session.sessionId)
        console.log(`[CLEANUP] Deleted zero-lap ghost: ${session.sessionId}`)
      } catch (e: any) {
        console.error(`[CLEANUP] Error deleting zero-lap ${session.sessionId}:`, e.message)
      }
    }

    await rebuildUserIndex(uid)
    await loadAndAnalyze()
  } catch (e: any) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
}

async function deleteOldFormatFromGroup(groupKey: string) {
  if (!currentUser.value) return

  const uid = currentUser.value.uid
  const group = duplicateGroups.value.get(groupKey)
  if (!group) return

  const oldFormatSessions = group.filter(s => isOldFormat(s.sessionId))

  for (const session of oldFormatSessions) {
    try {
      await deleteSessionEverywhere(uid, session.sessionId)
      console.log(`[CLEANUP] Deleted old-format duplicate: ${session.sessionId}`)
    } catch (e: any) {
      console.error(`[CLEANUP] Error deleting ${session.sessionId}:`, e.message)
    }
  }

  await rebuildUserIndex(uid)
  await loadAndAnalyze()
}

async function deleteAllOldFormat() {
  if (!currentUser.value) return

  isLoading.value = true

  try {
    for (const [key] of duplicateGroups.value) {
      await deleteOldFormatFromGroup(key)
    }
  } finally {
    isLoading.value = false
  }
}

async function deleteOlderDuplicates() {
  if (!currentUser.value) return

  isLoading.value = true
  const uid = currentUser.value.uid

  try {
    for (const [key, group] of duplicateGroups.value) {
      if (group.length <= 1) continue

      const sorted = [...group].sort((a, b) => {
        const timeA = a.uploadedAt?.toMillis?.() || a.uploadedAt?.seconds * 1000 || 0
        const timeB = b.uploadedAt?.toMillis?.() || b.uploadedAt?.seconds * 1000 || 0
        return timeB - timeA
      })

      const toDelete = sorted.slice(1)
      console.log(`[CLEANUP] Group ${key}: keeping ${sorted[0].sessionId}, deleting ${toDelete.length} older duplicates`)

      for (const session of toDelete) {
        try {
          await deleteSessionEverywhere(uid, session.sessionId)
          console.log(`[CLEANUP] Deleted older duplicate: ${session.sessionId}`)
        } catch (e: any) {
          console.error(`[CLEANUP] Error deleting ${session.sessionId}:`, e.message)
        }
      }
    }

    await rebuildUserIndex(uid)
    await loadAndAnalyze()
  } finally {
    isLoading.value = false
  }
}

const totalSessions = computed(() => sessions.value.length)
const duplicateGroupCount = computed(() => duplicateGroups.value.size)
const zeroLapCount = computed(() => zeroLapSessions.value.length)
const olderDuplicateCount = computed(() => {
  let count = 0
  for (const [_, group] of duplicateGroups.value) {
    if (group.length > 1) {
      count += group.length - 1
    }
  }
  return count
})

onMounted(() => {
  loadAndAnalyze()
})
</script>

<template>
  <LayoutPageContainer>
    <h1 class="page-title">DEV Cleanup - Ghost and Duplicate Sessions</h1>

    <div class="cleanup-container">
      <div class="stats-row">
        <div class="stat-box">
          <span class="stat-value">{{ totalSessions }}</span>
          <span class="stat-label">Total Sessions</span>
        </div>
        <div class="stat-box stat-box--danger">
          <span class="stat-value">{{ zeroLapCount }}</span>
          <span class="stat-label">Zero-Lap Ghosts</span>
        </div>
        <div class="stat-box stat-box--warning">
          <span class="stat-value">{{ duplicateGroupCount }}</span>
          <span class="stat-label">Duplicate Groups</span>
        </div>
        <div class="stat-box stat-box--success">
          <span class="stat-value">{{ deletedCount }}</span>
          <span class="stat-label">Deleted</span>
        </div>
      </div>

      <div class="actions-row">
        <button @click="loadAndAnalyze" :disabled="isLoading" class="btn btn--secondary">
          Refresh
        </button>
        <button @click="deleteZeroLapGhosts" :disabled="isLoading || zeroLapCount === 0" class="btn btn--danger">
          Delete Zero-Lap Ghosts ({{ zeroLapCount }})
        </button>
        <button @click="deleteOlderDuplicates" :disabled="isLoading || olderDuplicateCount === 0" class="btn btn--danger">
          Delete Older Duplicates ({{ olderDuplicateCount }})
        </button>
        <button @click="deleteAllOldFormat" :disabled="isLoading || duplicateGroupCount === 0" class="btn btn--secondary">
          Delete Old Format Only
        </button>
      </div>

      <div v-if="error" class="error-box">
        {{ error }}
      </div>

      <div v-if="isLoading" class="loading-box">
        Loading...
      </div>

      <template v-else>
        <div v-if="zeroLapCount > 0" class="section">
          <h2 class="section-title">Zero-Lap Ghost Sessions</h2>
          <div class="groups-list">
            <div class="group-card">
              <div class="group-header">
                <span class="group-key">Sessions currently stored on Firebase with summary.laps = 0</span>
              </div>
              <div class="group-sessions">
                <div
                  v-for="session in zeroLapSessions"
                  :key="session.sessionId"
                  class="session-item session-item--old"
                >
                  <span class="session-format">GHOST</span>
                  <span class="session-id">{{ session.sessionId }}</span>
                  <span class="session-track">{{ session.meta?.track }}</span>
                  <span class="session-date">{{ session.meta?.date_start?.split('T')[0] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="duplicateGroupCount > 0" class="section">
          <h2 class="section-title">Duplicate Groups</h2>
          <div class="groups-list">
            <div
              v-for="[key, group] in duplicateGroups"
              :key="key"
              class="group-card"
            >
              <div class="group-header">
                <span class="group-key">{{ key }}</span>
                <button
                  @click="deleteOldFormatFromGroup(key)"
                  class="btn btn--small btn--danger"
                >
                  Delete Old Format
                </button>
              </div>

              <div class="group-sessions">
                <div
                  v-for="session in group"
                  :key="session.sessionId"
                  :class="['session-item', { 'session-item--old': isOldFormat(session.sessionId) }]"
                >
                  <span class="session-format">
                    {{ isOldFormat(session.sessionId) ? 'OLD' : 'NEW' }}
                  </span>
                  <span class="session-id">{{ session.sessionId }}</span>
                  <span class="session-track">{{ session.meta?.track }}</span>
                  <span class="session-date">{{ session.meta?.date_start?.split('T')[0] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="zeroLapCount === 0 && duplicateGroupCount === 0" class="success-box">
          No ghosts or duplicates found. Your sessions are clean.
        </div>
      </template>

      <NuxtLink to="/panoramica" class="back-link">
        Back to Dashboard
      </NuxtLink>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.page-title {
  font-family: 'Outfit', $font-primary;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 24px;
}

.cleanup-container {
  max-width: 1000px;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 12px;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.stat-box {
  flex: 1;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  text-align: center;

  &--warning {
    border-color: rgba(255, 200, 50, 0.4);
    background: rgba(255, 200, 50, 0.1);
  }

  &--danger {
    border-color: rgba(255, 100, 100, 0.4);
    background: rgba(255, 100, 100, 0.1);
  }

  &--success {
    border-color: rgba(100, 255, 150, 0.4);
    background: rgba(100, 255, 150, 0.1);
  }
}

.stat-value {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: #fff;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &--secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    &:hover { background: rgba(255, 255, 255, 0.15); }
  }

  &--danger {
    background: rgba(255, 100, 100, 0.8);
    color: #fff;
    &:hover { background: rgba(255, 100, 100, 1); }
  }

  &--small {
    padding: 6px 12px;
    font-size: 12px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.error-box {
  padding: 16px;
  background: rgba(255, 100, 100, 0.15);
  border: 1px solid rgba(255, 100, 100, 0.4);
  border-radius: 8px;
  color: #ff6464;
  margin-bottom: 16px;
}

.loading-box {
  padding: 40px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
}

.success-box {
  padding: 40px;
  text-align: center;
  background: rgba(100, 255, 150, 0.1);
  border: 1px solid rgba(100, 255, 150, 0.3);
  border-radius: 8px;
  color: #64ff96;
  font-size: 18px;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.group-key {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.group-sessions {
  padding: 8px;
}

.session-item {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 120px 100px;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;

  &--old {
    background: rgba(255, 100, 100, 0.1);
    border: 1px solid rgba(255, 100, 100, 0.3);
  }
}

.session-format {
  font-weight: 600;
}

.session-id {
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-track {
  color: rgba(255, 255, 255, 0.8);
}

.session-date {
  color: rgba(255, 255, 255, 0.5);
}

.back-link {
  display: inline-block;
  margin-top: 24px;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: 14px;

  &:hover {
    color: #fff;
  }
}
</style>
