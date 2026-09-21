// PIP-438: durata delle cache davanti a Firebase, in un solo posto.
//
// I dati dell'owner (proiezioni, lista sessioni, calendario) cambiano solo quando questo
// client carica una sessione o modifica qualcosa, e in quei casi la cache viene svuotata
// subito da `invalidateTelemetryCaches` (sync, profilo, calendario, refresh manuale).
// Il TTL resta solo come rete di sicurezza per chi scrive da un altro PC dello stesso account.
export const OWNER_DATA_CACHE_TTL_MS = 15 * 60_000

// Dati scritti da altri utenti (coach, directory): nessun evento locale li invalida.
export const SHARED_DATA_CACHE_TTL_MS = 60_000
