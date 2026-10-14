const hints: Record<string, string> = {
  coach: 'Annuncia il tempo sul giro.',
  references: 'Annuncia i riferimenti di frenata.',
  'pressure-audio': 'Avvisa quando le pressioni non sono ottimali.',
  'target-voice': 'Annuncia se il giro è dentro o fuori target.',
  fuel: 'Imposta il carburante per i minuti scelti.',
  'fuel-session': 'Imposta il carburante per l’intera sessione.',
  pitwall: 'Apri o chiudi la stanza Pitwall.',
  pressure: 'Regola le pressioni ai valori ottimali.',
  target: 'Giro obiettivo: imposta il tempo da battere.',
  'target-disable': 'Tempo giro: disattiva il tempo obiettivo.',
  'sector-references': 'Settori obiettivo: tempi da battere.',
  'sector-disable': 'Settori: ripristina il confronto abituale.',
  Timer: 'Timer: avvia un conto alla rovescia.',
  timer: 'Timer: avvia un conto alla rovescia.',
  'Layout verticale': 'Layout: disponi il pannello in verticale.',
  'Layout orizzontale': 'Layout: disponi il pannello in orizzontale.',
  'fuel-minus': 'Durata: togli un minuto allo stint.',
  'fuel-plus': 'Durata: aggiungi un minuto allo stint.',
  'fuel-apply': 'Carburante: applica i litri al setup.',
}

/** Copy follows the canonical action IDs, independently of input device. */
export function quickPanelActionHint(actionId: string | null | undefined): string {
  if (actionId?.startsWith('friend-accept:')) return 'Amicizia: accetta la richiesta.'
  if (actionId?.startsWith('friend-reject:')) return 'Amicizia: rifiuta la richiesta.'
  return actionId && Object.hasOwn(hints, actionId) ? hints[actionId]! : 'Seleziona un comando per i dettagli.'
}
