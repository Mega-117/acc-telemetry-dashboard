// PIP-591 (X-A05-42/43): esito di un salvataggio dell'attrezzatura, deciso dopo la scrittura.
// - 'other-account': durante l'attesa e' cambiato account, la pagina non va toccata;
// - 'keep-editing': durante l'attesa l'utente ha cambiato ancora qualcosa, che resta da salvare;
// - 'done': quanto mostrato e' esattamente quanto salvato, l'editor si chiude.
export type EquipmentSaveOutcome = 'other-account' | 'keep-editing' | 'done'

export function resolveEquipmentSaveOutcome(params: {
  sentUid: string
  currentUid: string | null | undefined
  sent: Record<string, unknown>
  current: Record<string, unknown>
}): EquipmentSaveOutcome {
  if (params.currentUid !== params.sentUid) return 'other-account'
  return JSON.stringify(params.current) === JSON.stringify(params.sent) ? 'done' : 'keep-editing'
}
