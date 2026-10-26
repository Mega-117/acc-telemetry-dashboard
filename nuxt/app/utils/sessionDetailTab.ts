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
}

export function initialDetailTab(ctx: DetailTabContext): 'sessione' | 'avanzata' {
  if (ctx.evo || ctx.foreign || !ctx.hasLapToken) return 'sessione'
  return ctx.desktop || ctx.viewingPilot ? 'avanzata' : 'sessione'
}
