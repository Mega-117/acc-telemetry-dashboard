// PIP-540: pagina "Stato" dell'admin. Una frase: guarda gli ultimi 7 giorni di pacchetti
// diagnostici, stato delle installazioni ed errori segnalati, e li traduce in un elenco di
// problemi in italiano semplice con un semaforo (rosso = qualcosa si e' rotto, giallo = da
// guardare, verde = niente). Funzione pura: legge e scrive nulla, si prova da sola.

import type { AdminCockpitInstallation } from '~/repositories/adminCockpitRepository'
import type { DiagnosticBundleItem } from '~/repositories/diagnosticBundlesRepository'
import { ACTIVE_WINDOW_DAYS, isActiveWithinDays, isTestOwner } from '~/utils/adminInstallationScope'

export type StatusLevel = 'ok' | 'warn' | 'problem'

export interface StatusIssue {
  id: string
  level: 'warn' | 'problem'
  title: string
  detail: string
  ownerUid: string | null
  who: string
  installationId: string | null
  os: string | null
  count: number
  lastAt: string
  bundle: Pick<DiagnosticBundleItem, 'key' | 'installationId' | 'bundleId'> | null
  test: boolean
}

export interface StatusErrorEvent {
  userId: string
  pilotNickname?: string
  code?: string
  severity?: string
  receivedAt: string
}

export interface StatusSummary {
  level: StatusLevel
  issues: StatusIssue[]
  testIssues: StatusIssue[]
  windows: { windows10: number, windows11: number, other: number }
  reporting: { active: number, sendingBundles: number }
}

type Rule = { level: 'warn' | 'problem', title: string, detail: string }

// Motivo del pacchetto -> frase. Il motivo lo scrive l'app desktop (diagnosticBundle.js).
const BUNDLE_RULES: Record<string, Rule> = {
  'app.unclean-exit': {
    level: 'problem', title: "L'app si è chiusa di colpo",
    detail: 'Non è passata da "Esci" né dallo spegnimento di Windows: crash, blocco o chiusura forzata.',
  },
  'incident.renderer-gone': {
    level: 'problem', title: "Una finestra dell'app è andata in crash",
    detail: 'Il contenuto di una finestra (dashboard o HUD) si è chiuso da solo.',
  },
  'process.uncaught_exception': {
    level: 'problem', title: 'Errore interno del programma',
    detail: 'Un errore non previsto nel processo principale.',
  },
  'process.unhandled_rejection': {
    level: 'warn', title: 'Errore interno non gestito',
    detail: "Un'operazione è fallita senza che il programma la gestisse.",
  },
  'incident.child-process-gone': {
    level: 'warn', title: "Un processo dell'app si è chiuso da solo",
    detail: 'Per esempio la grafica o un servizio interno: di solito si riavvia.',
  },
  'incident.renderer-unresponsive': {
    level: 'warn', title: 'Una finestra non rispondeva',
    detail: 'Per qualche secondo una finestra non ha risposto ai comandi.',
  },
  'incident.main-stall': {
    level: 'warn', title: "L'app si è bloccata per qualche secondo",
    detail: 'Il processo principale è rimasto fermo: HUD e comandi possono aver tardato.',
  },
  'ctrlk.failed': {
    level: 'warn', title: 'Un comando Ctrl+K non è riuscito',
    detail: "Un'automazione richiesta dal pilota non è andata a buon fine.",
  },
  'capture.fallback': {
    level: 'warn', title: 'Cattura di ACC: usato un metodo di riserva',
    detail: 'Su Windows 10 il primo metodo di cattura non ha funzionato.',
  },
  'capture.open-too-long': {
    level: 'warn', title: 'Cattura di ACC rimasta aperta a lungo',
    detail: 'Una sessione di cattura non si è chiusa dopo 10 minuti.',
  },
}
const UNKNOWN_ANOMALY: Rule = {
  level: 'warn', title: 'Anomalia registrata',
  detail: 'Pacchetto di una versione precedente: il motivo è scritto dentro il pacchetto.',
}
// PIP-567: un motivo che il pannello non conosce ancora (nuovo innesco, pacchetto forzato dagli
// strumenti sviluppo) non deve sparire dal semaforo: si mostra col suo nome.
function anomalyRule(bundle: Pick<DiagnosticBundleItem, 'kind' | 'trigger'>): Rule | undefined {
  if (bundle.trigger && BUNDLE_RULES[bundle.trigger]) return BUNDLE_RULES[bundle.trigger]
  if (bundle.kind !== 'anomaly') return undefined // es. una cattura chiusa normalmente: nessun problema
  if (!bundle.trigger) return UNKNOWN_ANOMALY
  return { level: 'warn', title: 'Anomalia registrata', detail: `Motivo: ${bundle.trigger}.` }
}

function installationRule(installation: AdminCockpitInstallation): Rule | null {
  const health = installation.health.status.toLowerCase()
  const migration = installation.migration.status.toLowerCase()
  const reason = (installation.health.reasonCode || '').toLowerCase()
  if (['partial', 'error', 'failed', 'blocked'].some((value) => migration.includes(value)) || reason.startsWith('migration')) {
    if (health === 'healthy') return null
    return {
      level: 'problem', title: 'Spostamento dei dati fermo a metà',
      detail: "L'app ha iniziato a spostare i dati in una nuova versione e non ha finito.",
    }
  }
  if (reason.startsWith('update_failed')) {
    return {
      level: 'warn', title: 'Aggiornamento non riuscito',
      detail: "L'app continua a funzionare con la versione precedente.",
    }
  }
  if (['degraded', 'error', 'failed', 'blocked'].some((value) => health.includes(value))) {
    return {
      level: 'warn', title: "L'app è partita con problemi",
      detail: installation.health.reasonCode ? `Codice: ${installation.health.reasonCode}` : 'Senza codice.',
    }
  }
  if (installation.updateState.toLowerCase() === 'pending') {
    return { level: 'warn', title: 'Aggiornamento in sospeso', detail: "C'è una versione nuova non ancora installata." }
  }
  return null
}

export function osFamily(os: string | null | undefined): 'windows10' | 'windows11' | 'other' {
  if (os?.startsWith('Windows 10 ')) return 'windows10'
  if (os?.startsWith('Windows 11 ')) return 'windows11'
  return 'other'
}

export function buildStatusSummary(input: {
  installations: AdminCockpitInstallation[]
  bundles: DiagnosticBundleItem[]
  errors: StatusErrorEvent[]
  names: Record<string, string>
  nowMs: number
  days?: number
}): StatusSummary {
  const days = input.days ?? ACTIVE_WINDOW_DAYS
  const fromMs = input.nowMs - days * 86_400_000
  const ownerByInstallation = new Map(input.installations.map((item) => [item.installationId, item.ownerUid]))
  // Windows piu' recente dichiarato da ogni installazione (pacchetti in ordine dal piu' nuovo).
  const osByInstallation = new Map<string, string>()
  for (const bundle of [...input.bundles].sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))) {
    if (bundle.os && !osByInstallation.has(bundle.installationId)) osByInstallation.set(bundle.installationId, bundle.os)
  }
  const nameOf = (uid: string | null, installationId: string | null) => (
    (uid && input.names[uid]) || (installationId ? `Installazione ${installationId.slice(0, 8)}` : 'Utente sconosciuto')
  )

  const grouped = new Map<string, StatusIssue>()
  function add(rule: Rule, key: string, at: string, ctx: {
    ownerUid: string | null, installationId: string | null, bundle?: StatusIssue['bundle'], count?: number
  }) {
    // PIP-591 (X-A07-15): anche chi ha subito il problema fa parte del gruppo. Sulla stessa
    // installazione un account di prova e uno reale restano separati: l'anomalia del pilota
    // reale non finisce nascosta fra gli account di prova.
    const id = `${key}|${ctx.ownerUid ?? ''}|${rule.title}`
    const existing = grouped.get(id)
    if (existing) {
      existing.count += ctx.count ?? 1
      if (Date.parse(at) >= Date.parse(existing.lastAt)) {
        existing.lastAt = at
        if (ctx.bundle) existing.bundle = ctx.bundle
      }
      return
    }
    grouped.set(id, {
      id, level: rule.level, title: rule.title, detail: rule.detail,
      ownerUid: ctx.ownerUid, who: nameOf(ctx.ownerUid, ctx.installationId),
      installationId: ctx.installationId, os: ctx.installationId ? osByInstallation.get(ctx.installationId) ?? null : null,
      count: ctx.count ?? 1, lastAt: at, bundle: ctx.bundle ?? null,
      test: ctx.ownerUid ? isTestOwner(ctx.ownerUid) : false,
    })
  }

  for (const bundle of input.bundles) {
    if (Date.parse(bundle.uploadedAt) < fromMs) continue
    if (bundle.kind !== 'anomaly' && bundle.kind !== 'capture') continue
    const rule = anomalyRule(bundle)
    if (!rule) continue
    const ownerUid = bundle.uploaderUid || ownerByInstallation.get(bundle.installationId) || null
    add(rule, bundle.installationId, bundle.uploadedAt, {
      ownerUid, installationId: bundle.installationId,
      bundle: { key: bundle.key, installationId: bundle.installationId, bundleId: bundle.bundleId },
    })
  }

  for (const installation of input.installations) {
    if (!isActiveWithinDays(installation, input.nowMs, days)) continue
    const rule = installationRule(installation)
    if (!rule) continue
    add(rule, installation.installationId, installation.lastContactAt || new Date(input.nowMs).toISOString(), {
      ownerUid: installation.ownerUid, installationId: installation.installationId,
    })
  }

  for (const event of input.errors) {
    if (Date.parse(event.receivedAt) < fromMs) continue
    const code = event.code || 'senza codice'
    add({
      level: event.severity === 'fatal' ? 'problem' : 'warn',
      title: event.severity === 'fatal' ? `Errore grave segnalato: ${code}` : `Errore segnalato: ${code}`,
      detail: 'Il dettaglio è nella pagina Diagnostica.',
    }, `user:${event.userId}`, event.receivedAt, { ownerUid: event.userId || null, installationId: null })
  }

  const all = [...grouped.values()].sort((a, b) => (
    (a.level === b.level ? 0 : a.level === 'problem' ? -1 : 1) || Date.parse(b.lastAt) - Date.parse(a.lastAt)
  ))
  const issues = all.filter((issue) => !issue.test)
  const testIssues = all.filter((issue) => issue.test)

  const windows = { windows10: 0, windows11: 0, other: 0 }
  const active = input.installations.filter((item) => !isTestOwner(item.ownerUid) && isActiveWithinDays(item, input.nowMs, days))
  const activeIds = new Set(active.map((item) => item.installationId))
  for (const [installationId, os] of osByInstallation) {
    if (activeIds.has(installationId)) windows[osFamily(os)] += 1
  }
  const sending = new Set(input.bundles
    .filter((bundle) => activeIds.has(bundle.installationId) && Date.parse(bundle.uploadedAt) >= fromMs)
    .map((bundle) => bundle.installationId))

  return {
    level: issues.some((issue) => issue.level === 'problem') ? 'problem' : issues.length ? 'warn' : 'ok',
    issues,
    testIssues,
    windows,
    reporting: { active: active.length, sendingBundles: sending.size },
  }
}
