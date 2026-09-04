// ============================================
// Il numero d'ordine crescente degli ordini alla vettura.
//
// Il PC che applica scarta un ordine con revisione non successiva all'ultima
// vista. Un contatore che riparte da zero a ogni ricarica farebbe sembrare
// vecchio il primo invio successivo; i secondi dall'epoca crescono sempre,
// anche fra sessioni, dispositivi e ingegneri diversi.
//
// I secondi pero' non bastano da soli: due invii nello stesso secondo -
// facilissimo con due clic - avrebbero la stessa revisione, e il secondo
// verrebbe rifiutato come "superato", che e' un motivo falso e
// incomprensibile per chi lo legge. Qui la revisione non torna mai indietro e
// non si ripete.
// ============================================

export function createPitwallRevisionClock(now: () => number = Date.now) {
  let last = 0
  return function nextRevision(): number {
    last = Math.max(last + 1, Math.floor(now() / 1000))
    return last
  }
}
