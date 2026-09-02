// ============================================
// emailDomainHint - Suggerimento sul dominio email
// ============================================
//
// Logica pura, senza I/O e senza rete: guarda solo l'indirizzo che l'utente sta
// scrivendo nel proprio browser e, se il dominio sembra un refuso di uno noto,
// restituisce il dominio corretto.
//
// Perche' esiste (PIP-372): un dominio sbagliato per un carattere - `gmail.co`
// invece di `gmail.com` - e' formalmente valido, quindi Firebase crea l'account
// senza obiezioni, ma nessuna mail potra' mai raggiungerlo. L'utente resta
// bloccato al gate di verifica e serve un intervento admin per liberarlo.
// Intercettare il refuso prima della registrazione costa una riga all'utente
// invece di una procedura manuale.

/**
 * Domini di posta legittimi e diffusi tra i piloti del progetto.
 *
 * Serve a due scopi opposti e ugualmente importanti: sono i candidati che
 * possiamo suggerire, ed e' anche la lista di cio' che non va mai segnalato.
 * Un dominio presente qui e' corretto per definizione, quindi non genera
 * alcun avviso: e' cosi' che `hotmail.it` non viene scambiato per un refuso
 * di `hotmail.com`.
 */
const KNOWN_DOMAINS = [
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'outlook.it',
    'hotmail.com',
    'hotmail.it',
    'live.com',
    'live.it',
    'msn.com',
    'yahoo.com',
    'yahoo.it',
    'icloud.com',
    'me.com',
    'proton.me',
    'protonmail.com',
    'libero.it',
    'virgilio.it',
    'alice.it',
    'tiscali.it',
    'tin.it',
    'email.it',
    'fastwebnet.it',
    'aruba.it',
    'pec.it'
] as const

/**
 * Un dominio candidato va suggerito solo se la differenza e' plausibilmente un
 * refuso e non una scelta deliberata. Una sola modifica basta per i casi che
 * vediamo davvero (`gmail.co`, `gmial.com`); due modifiche le accettiamo solo
 * su domini abbastanza lunghi da rendere improbabile la collisione con un
 * dominio diverso e legittimo.
 */
const MAX_DISTANCE = 2
const MIN_LENGTH_FOR_TWO_EDITS = 8

/**
 * Distanza di Levenshtein fra due stringhe, con due righe invece della matrice
 * intera: i domini sono corti e questa resta la versione piu' leggibile a
 * parita' di risultato.
 */
function editDistance(a: string, b: string): number {
    if (a === b) return 0
    if (!a.length) return b.length
    if (!b.length) return a.length

    let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
    let current = new Array<number>(b.length + 1)

    for (let i = 1; i <= a.length; i += 1) {
        current[0] = i

        for (let j = 1; j <= b.length; j += 1) {
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
            current[j] = Math.min(
                (current[j - 1] as number) + 1,
                (previous[j] as number) + 1,
                (previous[j - 1] as number) + substitutionCost
            )
        }

        const swap = previous
        previous = current
        current = swap
    }

    return previous[b.length] as number
}

/**
 * Estrae il dominio da un indirizzo email, normalizzato in minuscolo.
 * Restituisce `null` se l'indirizzo non ha ancora la forma `locale@dominio`:
 * mentre l'utente digita e' la norma, e non e' un errore da segnalare.
 */
function extractDomain(email: string): string | null {
    const trimmed = email.trim().toLowerCase()
    const separator = trimmed.lastIndexOf('@')

    if (separator <= 0 || separator === trimmed.length - 1) return null

    const domain = trimmed.slice(separator + 1)

    // Senza almeno un punto non e' ancora un dominio compiuto: l'utente sta
    // probabilmente ancora scrivendo.
    return domain.includes('.') ? domain : null
}

/**
 * Restituisce il dominio corretto se quello digitato sembra un suo refuso,
 * altrimenti `null`.
 *
 * Non decide nulla sull'interfaccia: chi chiama sceglie se e come mostrare il
 * suggerimento. Per contratto il risultato e' sempre un dominio della lista
 * nota, mai l'indirizzo digitato dall'utente, cosi' nessuna schermata puo'
 * finire per esporre un indirizzo email a partire da questo modulo.
 */
export function suggestEmailDomain(email: string): string | null {
    const domain = extractDomain(email)
    if (!domain) return null

    // Un dominio noto e' corretto per definizione: nessun avviso.
    if (KNOWN_DOMAINS.includes(domain as (typeof KNOWN_DOMAINS)[number])) return null

    let best: { domain: string; distance: number } | null = null

    for (const candidate of KNOWN_DOMAINS) {
        const distance = editDistance(domain, candidate)

        if (distance > MAX_DISTANCE) continue
        if (distance === 2 && candidate.length < MIN_LENGTH_FOR_TWO_EDITS) continue
        if (!best || distance < best.distance) best = { domain: candidate, distance }
    }

    return best?.domain ?? null
}

/**
 * Messaggio pronto per l'interfaccia, oppure `null` se non c'e' nulla da dire.
 *
 * Volutamente generico: nomina il dominio corretto e mai l'indirizzo digitato.
 * Il testo vive qui e non nei singoli form, cosi' registrazione e recupero
 * password dicono la stessa cosa senza duplicarla.
 */
export function emailDomainHintMessage(email: string): string | null {
    const suggestion = suggestEmailDomain(email)

    return suggestion ? `Controlla il dominio: forse intendevi @${suggestion}?` : null
}
