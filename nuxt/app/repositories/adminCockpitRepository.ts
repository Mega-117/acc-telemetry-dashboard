import { collection, collectionGroup, limit, orderBy, query } from 'firebase/firestore'
import { trackedGetDocs } from '~/composables/useFirebaseTracker'
import { db } from '~/config/firebase'
import {
  mapPilotDirectoryDocument,
  type PilotDirectoryItem,
} from '~/repositories/pilotDirectoryRepository'

const CALLER = 'AdminCockpitRepository'

export const ADMIN_COCKPIT_DIRECTORY_LIMIT = 100
export const ADMIN_COCKPIT_INSTALLATION_LIMIT = 200
export const ADMIN_COCKPIT_READ_REQUEST_BUDGET = 2
export const ADMIN_COCKPIT_WRITE_BUDGET = 0

export interface AdminCockpitInstallation {
  ownerUid: string
  installationId: string
  startedAt: string | null
  lastContactAt: string | null
  suiteVersion: string | null
  channel: string | null
  updateState: string
  lastCheckAt: string | null
  components: {
    launcher: string | null
    logger: string | null
    webapp: string | null
    kokoroRuntime: string | null
  }
  health: {
    status: string
    phase: string
    reasonCode: string | null
  }
  migration: {
    status: string
    phase: string
    progress: number
    code: string | null
    resumedFrom: string | null
  }
}

export interface AdminCockpitRow {
  rowId: string
  pilot: PilotDirectoryItem
  installation: AdminCockpitInstallation | null
  installationCount: number
  directoryAvailable: boolean
}

export interface AdminCockpitSnapshot {
  rows: AdminCockpitRow[]
  pilotCount: number
  installationCount: number
  attentionCount: number
  coverageLimited: boolean
  directoryLimitReached: boolean
  installationLimitReached: boolean
  budget: {
    readRequests: number
    maxDocuments: number
    writes: 0
  }
}

type QuerySnapshotLike = {
  docs?: any[]
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function boundedProgress(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0
}

export function mapAdminCockpitInstallation(docSnap: any): AdminCockpitInstallation | null {
  const ownerUid = textOrNull(docSnap?.ref?.parent?.parent?.id)
  const data = docSnap?.data?.() || {}
  const installationId = textOrNull(data.installationId) || textOrNull(docSnap?.id)
  if (!ownerUid || !installationId) return null

  return {
    ownerUid,
    installationId,
    startedAt: textOrNull(data.startedAt),
    lastContactAt: textOrNull(data.lastContactAt),
    suiteVersion: textOrNull(data.suiteVersion),
    channel: textOrNull(data.channel),
    updateState: textOrNull(data.updateState) || 'unknown',
    lastCheckAt: textOrNull(data.lastCheckAt),
    components: {
      launcher: textOrNull(data.components?.launcher),
      logger: textOrNull(data.components?.logger),
      webapp: textOrNull(data.components?.webapp),
      kokoroRuntime: textOrNull(data.components?.kokoroRuntime),
    },
    health: {
      status: textOrNull(data.health?.status) || 'unknown',
      phase: textOrNull(data.health?.phase) || 'unknown',
      reasonCode: textOrNull(data.health?.reasonCode),
    },
    migration: {
      status: textOrNull(data.migration?.status) || 'unknown',
      phase: textOrNull(data.migration?.phase) || 'unknown',
      progress: boundedProgress(data.migration?.progress),
      code: textOrNull(data.migration?.code),
      resumedFrom: textOrNull(data.migration?.resumedFrom),
    },
  }
}

function fallbackPilot(uid: string): PilotDirectoryItem {
  return {
    uid,
    nickname: 'Profilo non disponibile',
    role: 'unknown',
  }
}

function installationNeedsAttention(installation: AdminCockpitInstallation): boolean {
  const health = installation.health.status.toLowerCase()
  const migration = installation.migration.status.toLowerCase()
  const update = installation.updateState.toLowerCase()
  return ['degraded', 'error', 'failed', 'blocked'].some((value) => health.includes(value))
    || ['partial', 'error', 'failed', 'blocked'].some((value) => migration.includes(value))
    || update === 'pending'
}

export function buildAdminCockpitSnapshot(
  pilots: PilotDirectoryItem[],
  installations: AdminCockpitInstallation[],
  limits: {
    directoryLimitReached?: boolean
    installationLimitReached?: boolean
  } = {},
): AdminCockpitSnapshot {
  const pilotByUid = new Map(pilots.map((pilot) => [pilot.uid, pilot]))
  const installationCounts = new Map<string, number>()
  const installedPilotIds = new Set<string>()

  for (const installation of installations) {
    installationCounts.set(
      installation.ownerUid,
      (installationCounts.get(installation.ownerUid) || 0) + 1,
    )
    installedPilotIds.add(installation.ownerUid)
  }

  const installationRows: AdminCockpitRow[] = installations.map((installation) => ({
    rowId: `${installation.ownerUid}:${installation.installationId}`,
    pilot: pilotByUid.get(installation.ownerUid) || fallbackPilot(installation.ownerUid),
    installation,
    installationCount: installationCounts.get(installation.ownerUid) || 1,
    directoryAvailable: pilotByUid.has(installation.ownerUid),
  }))

  const noReportRows: AdminCockpitRow[] = pilots
    .filter((pilot) => !installedPilotIds.has(pilot.uid))
    .map((pilot) => ({
      rowId: `${pilot.uid}:no-report`,
      pilot,
      installation: null,
      installationCount: 0,
      directoryAvailable: true,
    }))

  const uniquePilotIds = new Set([
    ...pilots.map((pilot) => pilot.uid),
    ...installations.map((installation) => installation.ownerUid),
  ])
  const directoryLimitReached = limits.directoryLimitReached === true
  const installationLimitReached = limits.installationLimitReached === true

  return {
    rows: [...installationRows, ...noReportRows],
    pilotCount: uniquePilotIds.size,
    installationCount: installations.length,
    attentionCount: installations.filter(installationNeedsAttention).length,
    coverageLimited: directoryLimitReached || installationLimitReached,
    directoryLimitReached,
    installationLimitReached,
    budget: {
      readRequests: ADMIN_COCKPIT_READ_REQUEST_BUDGET,
      maxDocuments: ADMIN_COCKPIT_DIRECTORY_LIMIT + ADMIN_COCKPIT_INSTALLATION_LIMIT,
      writes: ADMIN_COCKPIT_WRITE_BUDGET,
    },
  }
}

export async function loadAdminCockpitSnapshot(overrides: {
  loadDirectory?: () => Promise<QuerySnapshotLike>
  loadInstallations?: () => Promise<QuerySnapshotLike>
} = {}): Promise<AdminCockpitSnapshot> {
  const loadDirectory = overrides.loadDirectory || (() => trackedGetDocs(
    query(
      collection(db, 'pilotDirectory'),
      orderBy('directorySortName', 'asc'),
      limit(ADMIN_COCKPIT_DIRECTORY_LIMIT),
    ),
    CALLER,
  ))
  const loadInstallations = overrides.loadInstallations || (() => trackedGetDocs(
    query(
      collectionGroup(db, 'runtimeInstallations'),
      orderBy('lastContactAt', 'desc'),
      limit(ADMIN_COCKPIT_INSTALLATION_LIMIT),
    ),
    CALLER,
  ))

  const [directorySnapshot, installationSnapshot] = await Promise.all([
    loadDirectory(),
    loadInstallations(),
  ])
  const directoryDocs = directorySnapshot.docs || []
  const installationDocs = installationSnapshot.docs || []
  const pilots = directoryDocs.map(mapPilotDirectoryDocument)
  const installations = installationDocs
    .map(mapAdminCockpitInstallation)
    .filter((item): item is AdminCockpitInstallation => item !== null)

  return buildAdminCockpitSnapshot(pilots, installations, {
    directoryLimitReached: directoryDocs.length >= ADMIN_COCKPIT_DIRECTORY_LIMIT,
    installationLimitReached: installationDocs.length >= ADMIN_COCKPIT_INSTALLATION_LIMIT,
  })
}
