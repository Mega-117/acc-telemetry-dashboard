// PIP-540: quali installazioni contano per la settimana di stabilita'
// (docs/wiki/decisions/2026-10-15-cancello-di-stabilita.md): reali, attive negli ultimi
// 7 giorni, sull'ultima versione del proprio canale. Funzioni pure: il filtro vive nel
// pannello, nessun documento Firestore viene cancellato o scritto.

import type { AdminCockpitInstallation } from '~/repositories/adminCockpitRepository'

export const ACTIVE_WINDOW_DAYS = 7

// Account dell'autore usati per prove: le loro installazioni non sono "reali".
// Admin 6Habr…, pilota di prova RICO117 e ingegnere di prova popo.
export const ADMIN_TEST_OWNER_UIDS: readonly string[] = [
  '6HabrFi2l9cQzKPndbwikoKDUmj1',
  '9pRwnLZ3ciZwl4X5eQ5vjKUHy6z2',
  '1XeaeZ9rnxcXgZDBjTFDiP6I8yL2'
]

export function isTestOwner(ownerUid: string, testUids: readonly string[] = ADMIN_TEST_OWNER_UIDS): boolean {
  return testUids.includes(ownerUid)
}

export function isActiveWithinDays(
  installation: Pick<AdminCockpitInstallation, 'lastContactAt'> | null,
  now: number,
  days = ACTIVE_WINDOW_DAYS
): boolean {
  const contact = installation?.lastContactAt ? Date.parse(installation.lastContactAt) : NaN
  return Number.isFinite(contact) && contact <= now + 5 * 60 * 1000 && now - contact <= days * 86_400_000
}

function identifiers(value: string): Array<number | string> {
  return value.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

/** Confronto di versioni tipo `0.4.5-dev.3`: il nucleo numerico, poi il prerelease (la release batte il dev). */
export function compareSuiteVersion(a: string, b: string): number {
  const [coreA = '', preA = ''] = a.trim().replace(/^v/i, '').split(/-(.*)/s)
  const [coreB = '', preB = ''] = b.trim().replace(/^v/i, '').split(/-(.*)/s)
  const cmp = (x: Array<number | string>, y: Array<number | string>): number => {
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      const left = x[i]
      const right = y[i]
      if (left === undefined) return -1
      if (right === undefined) return 1
      if (left === right) continue
      if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1
      return String(left) < String(right) ? -1 : 1
    }
    return 0
  }
  const core = cmp(identifiers(coreA), identifiers(coreB))
  if (core !== 0) return core
  if (!preA && !preB) return 0
  if (!preA) return 1
  if (!preB) return -1
  return cmp(identifiers(preA), identifiers(preB))
}

/** Versione piu' alta vista per ogni canale (canale mancante = "unknown"). */
export function latestVersionByChannel(
  installations: Array<Pick<AdminCockpitInstallation, 'channel' | 'suiteVersion'>>
): Map<string, string> {
  const latest = new Map<string, string>()
  for (const item of installations) {
    if (!item.suiteVersion) continue
    const channel = item.channel || 'unknown'
    const current = latest.get(channel)
    if (!current || compareSuiteVersion(item.suiteVersion, current) > 0) latest.set(channel, item.suiteVersion)
  }
  return latest
}

export function isOnLatestVersion(
  installation: Pick<AdminCockpitInstallation, 'channel' | 'suiteVersion'> | null,
  latest: Map<string, string>
): boolean {
  if (!installation?.suiteVersion) return false
  return latest.get(installation.channel || 'unknown') === installation.suiteVersion
}

export interface StabilityPopulation {
  active: number
  onLatest: number
  counted: number
  testHidden: number
  byChannel: Record<string, { counted: number, version: string | null }>
}

/** Quante installazioni contano per il cancello: reali + attive 7 g + ultima versione del canale. */
export function summarizeStabilityPopulation(
  installations: AdminCockpitInstallation[],
  now: number,
  testUids: readonly string[] = ADMIN_TEST_OWNER_UIDS
): StabilityPopulation {
  const real = installations.filter((item) => !isTestOwner(item.ownerUid, testUids))
  const latest = latestVersionByChannel(real.filter((item) => isActiveWithinDays(item, now)))
  const result: StabilityPopulation = {
    active: 0, onLatest: 0, counted: 0, testHidden: installations.length - real.length, byChannel: {}
  }
  for (const item of real) {
    if (!isActiveWithinDays(item, now)) continue
    result.active += 1
    const onLatest = isOnLatestVersion(item, latest)
    if (onLatest) result.onLatest += 1
    const channel = item.channel || 'unknown'
    result.byChannel[channel] ||= { counted: 0, version: latest.get(channel) ?? null }
    if (onLatest) {
      result.counted += 1
      result.byChannel[channel].counted += 1
    }
  }
  return result
}
