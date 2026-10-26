// PIP-631: problemi divisi per versione e canale (pagina Stato). Logica pura, nessuna lettura nuova:
// pacchetti R2 e errori Firestore portano gia' versione e canale.

export interface VersionInput {
  installations: { suiteVersion: string | null, channel: string | null, ownerUid?: string | null }[]
  bundles: { kind: string, trigger: string | null, version: string | null, channel: string | null }[]
  errors: { version?: string | null, channel?: string | null, severity?: string }[]
}

export interface VersionRow {
  key: string
  version: string
  channel: string
  installations: number
  crashes: number
  stalls: number
  otherAnomalies: number
  errors: number
}

const CHANNEL_LABEL: Record<string, string> = { main: 'Produzione', develop: 'Develop' }
export const channelLabel = (channel: string) => CHANNEL_LABEL[channel] ?? channel

/** "0.5.2-dev.1" > "0.5.1" > "0.4.9": confronto numerico, la dev dopo la base della stessa serie. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [base = '', dev] = v.split('-dev.')
    return [...base.split('.').map(n => Number(n) || 0), dev === undefined ? Number.MAX_SAFE_INTEGER : Number(dev) || 0]
  }
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function summarizeByVersion(input: VersionInput): VersionRow[] {
  const rows = new Map<string, VersionRow>()
  const row = (version: string | null | undefined, channel: string | null | undefined) => {
    const v = version || 'sconosciuta'
    const c = channel || 'sconosciuto'
    const key = `${c}|${v}`
    let r = rows.get(key)
    if (!r) {
      r = { key, version: v, channel: c, installations: 0, crashes: 0, stalls: 0, otherAnomalies: 0, errors: 0 }
      rows.set(key, r)
    }
    return r
  }
  for (const i of input.installations) row(i.suiteVersion, i.channel).installations += 1
  for (const b of input.bundles) {
    if (b.kind !== 'anomaly') continue
    const r = row(b.version, b.channel)
    if (b.trigger === 'app.unclean-exit') r.crashes += 1
    else if (b.trigger === 'incident.main-stall') r.stalls += 1
    else r.otherAnomalies += 1
  }
  for (const e of input.errors) row(e.version, e.channel).errors += 1
  return [...rows.values()].sort((a, b) => a.channel.localeCompare(b.channel) || compareVersions(b.version, a.version))
}
