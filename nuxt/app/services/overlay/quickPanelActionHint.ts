const hints: Record<string, string> = {
  coach: 'Giri: attiva o disattiva gli avvisi vocali.',
  references: 'Riferimenti: gestisci i richiami vocali.',
  'pressure-audio': 'Pressioni: gestisci gli avvisi vocali.',
  'target-voice': 'Tempo target: gestisci il confronto vocale.',
  fuel: 'A minuti: prepara il carburante dello stint.',
  'fuel-session': 'Sessione: imposta il carburante necessario.',
  pitwall: 'Pitwall: apri o chiudi la tua stanza.',
  pressure: 'Pressioni: applica i click al setup.',
  target: 'Tempo giro: imposta il tempo obiettivo.',
  'target-disable': 'Tempo giro: disattiva il tempo obiettivo.',
  'sector-references': 'Settori: imposta i tempi di riferimento.',
  'sector-disable': 'Settori: ripristina il confronto abituale.',
  Timer: 'Timer: avvia un conto alla rovescia.',
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
