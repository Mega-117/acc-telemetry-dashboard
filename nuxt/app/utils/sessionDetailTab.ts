// PIP-635: la vista con cui si apre il dettaglio sessione. Telemetria quando i giri della sessione
// possono esserci (programma desktop, o archivio online del pilota visto dal coach); Sessione negli altri casi.
export interface DetailTabContext {
  /** Sessione di Assetto Corsa EVO: la Telemetria non c'e'. */
  evo: boolean
  /** Sessione di un altro pilota aperta da link: i suoi giri non sono su questo PC. */
  foreign: boolean
  /** La sessione ha l'identificativo che collega i file dei giri. */
  hasLapToken: boolean
  /** Programma desktop con accesso ai giri registrati. */
  desktop: boolean
  /** Coach o admin che guarda un pilota: i giri arrivano dall'archivio online. */
  viewingPilot: boolean
  /** PIP-647: nel browser i propri giri arrivano dall'archivio online, che li tiene 30 giorni. */
  inArchive?: boolean
  /** PIP-651: the tab a shared link asks for (the one it was shared from). */
  requested?: 'sessione' | 'avanzata'
}

/** Giorni per cui l'archivio online tiene i giri (regola di scadenza del bucket). */
export const LAP_ARCHIVE_DAYS = 30

/** PIP-647: la sessione (token `AAAAMMGG_hhmmss`) è ancora nella finestra dell'archivio online. */
export function lapTokenInArchive(token: string | null | undefined, now = Date.now()): boolean {
  const m = token ? /^(\d{4})(\d{2})(\d{2})_/.exec(token) : null
  if (!m) return false
  return now - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) <= LAP_ARCHIVE_DAYS * 86400000
}

export function initialDetailTab(ctx: DetailTabContext): 'sessione' | 'avanzata' {
  if (ctx.evo || !ctx.hasLapToken) return 'sessione'
  // A shared link opens where it was shared from; without laps the page goes back to Sessione by itself.
  if (ctx.requested) return ctx.requested
  if (ctx.foreign) return 'sessione'
  return ctx.desktop || ctx.viewingPilot || ctx.inArchive ? 'avanzata' : 'sessione'
}
