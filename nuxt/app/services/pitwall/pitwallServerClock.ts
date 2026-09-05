// ============================================
// L'orologio comune del Pit Wall.
//
// Perche' esiste, in una frase: una scadenza scritta da un computer e giudicata
// da un altro deve essere misurata sullo stesso orologio, altrimenti non e' una
// scadenza ma una lotteria.
//
// Il caso reale che lo ha imposto (PIP-382, QA in pista del 2026-09-05): il PC
// del pilota aveva l'orologio avanti di quattro minuti. L'ingegnere mandava una
// strategia con scadenza "fra due minuti" secondo il *suo* orologio; il PC del
// pilota la riceveva un secondo dopo, la confrontava col *proprio* orologio, e
// la trovava scaduta da due minuti. Ogni ordine moriva all'istante, e nessuno
// dei due vedeva perche'. Lo stesso scarto rendeva stantii tutti i battiti
// (freschezza 90 s), quindi quel PC non si riconosceva nemmeno al volante.
//
// La soluzione non e' chiedere all'utente di sistemare l'orologio - lo faranno
// in pochi - ma smettere di dipendere dal suo: il server Firestore e' l'unico
// orologio che tutti i PC condividono gia', e ogni battito ne porta a casa
// l'ora esatta senza una sola lettura in piu'.
//
// La distinzione che questo modulo esiste per non far sbagliare piu':
//
//   - confronti con un'ora scritta da qualcun altro (o dal server) → ora del
//     server, sempre: scadenze, freschezza dei battiti, chi e' al volante;
//   - misure di tempo trascorso qui, fra due gesti di questo stesso PC (ogni
//     quanto ribattere, ogni quanto riprovare) → orologio locale, che per
//     quello va benissimo e non dipende da nessuno.
//
// Logica pura: nessun I/O, nessun Firestore (Principio 3). Chi misura e' il
// servizio della stanza, che di serverTimestamp ne scrive gia' uno per battito.
// ============================================

/**
 * Oltre quanto scarto vale la pena dirlo all'utente.
 *
 * Trenta secondi: sotto non cambia niente per nessuno (la finestra piu' stretta
 * che abbiamo e' un battito da 90 s), sopra si e' a un passo dal rompere il
 * Pit Wall e la causa e' fuori dal programma - quindi va detta, perche' e'
 * l'unica cosa che l'utente puo' risolvere da solo.
 */
export const PITWALL_CLOCK_SKEW_WARN_MS = 30_000

export interface PitwallServerClock {
  /**
   * Registra una misura: una scrittura partita a `sentMs`, confermata a
   * `ackedMs` (orologio locale) e datata `serverMs` dal server.
   */
  observe: (sentMs: number, ackedMs: number, serverMs: number) => void
  /** Adesso, sull'orologio del server. Senza misure vale l'orologio locale. */
  serverNow: () => number
  /** Un'ora del server tradotta nell'orologio di questo PC. */
  toLocalMs: (serverMs: number) => number
  /** Lo scarto misurato (server meno locale), o `null` se non lo sappiamo ancora. */
  offsetMs: () => number | null
  /** L'orologio di questo PC e' abbastanza sbagliato da meritare un avviso. */
  outOfSync: (thresholdMs?: number) => boolean
}

export interface PitwallServerClockOptions {
  now?: () => number
}

/**
 * L'orologio condiviso di un PC.
 *
 * Lo scarto si misura al centro della finestra della scrittura: il server data
 * il documento in un istante compreso fra "partita" e "confermata", quindi il
 * punto di mezzo sbaglia al massimo di mezzo giro di rete - decine di
 * millisecondi, contro finestre da decine di secondi. Non serve di meglio, e
 * qualcosa di meglio (NTP, ping ripetuti) costerebbe rete per una precisione
 * che nessuno qui userebbe.
 *
 * L'ultima misura vince invece di una media: se l'utente sistema l'orologio
 * mentre l'app e' aperta, la media continuerebbe a trascinarsi dietro il
 * vecchio errore per minuti.
 */
export function createPitwallServerClock(options: PitwallServerClockOptions = {}): PitwallServerClock {
  const now = options.now ?? (() => Date.now())
  let offset: number | null = null

  function observe(sentMs: number, ackedMs: number, serverMs: number): void {
    if (!Number.isFinite(sentMs) || !Number.isFinite(ackedMs) || !Number.isFinite(serverMs)) return
    // Una finestra al contrario significa orologio locale saltato durante la
    // scrittura: la misura non vuol dire niente e si butta, invece di
    // sostituire una stima buona con una rumorosa.
    if (ackedMs < sentMs) return
    offset = serverMs - (sentMs + ackedMs) / 2
  }

  return {
    observe,
    serverNow: () => now() + (offset ?? 0),
    toLocalMs: (serverMs: number) => serverMs - (offset ?? 0),
    offsetMs: () => offset,
    outOfSync: (thresholdMs: number = PITWALL_CLOCK_SKEW_WARN_MS) => (
      offset != null && Math.abs(offset) > thresholdMs
    ),
  }
}

/**
 * Come si dice all'utente che il suo orologio e' sbagliato.
 *
 * Con il numero e con il verso, perche' "sincronizza l'orologio" da solo
 * sembra un consiglio generico e viene ignorato; "avanti di 4 minuti" e' un
 * fatto che si va a controllare. `null` quando non c'e' niente da dire.
 */
export function describePitwallClockSkew(
  offsetMs: number | null,
  thresholdMs: number = PITWALL_CLOCK_SKEW_WARN_MS
): string | null {
  if (offsetMs == null || !Number.isFinite(offsetMs) || Math.abs(offsetMs) <= thresholdMs) return null
  // Lo scarto e' server meno locale: positivo significa che il server sta
  // avanti, cioe' che l'orologio di questo PC e' indietro.
  const behind = offsetMs > 0
  const seconds = Math.round(Math.abs(offsetMs) / 1000)
  const amount = seconds >= 90
    ? `${Math.round(seconds / 60)} minuti`
    : `${seconds} secondi`
  return `L'orologio di questo computer e ${behind ? 'indietro' : 'avanti'} di circa ${amount}: sincronizzalo in Impostazioni di Windows, altrimenti le strategie possono risultare scadute.`
}
