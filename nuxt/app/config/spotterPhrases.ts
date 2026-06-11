export type SpotterPhraseKey =
  | 'aheadGaining'
  | 'aheadLosing'
  | 'aheadStable'
  | 'behindClosing'
  | 'behindDropping'
  | 'behindStable'
  | 'attackWindow'

export const spotterPhrases: Record<SpotterPhraseKey, string[]> = {
  aheadGaining: [
    'Davanti, guadagni {delta}. Punto buono: settore {sector}.',
    'Stai recuperando sul pilota davanti. Forte nel settore {sector}.'
  ],
  aheadLosing: [
    'Il pilota davanti guadagna {delta}. Perdi soprattutto nel settore {sector}.',
    'Davanti si allontana. Il punto critico e settore {sector}.'
  ],
  aheadStable: [
    'Gap stabile davanti. Continua pulito.'
  ],
  behindClosing: [
    'Il pilota dietro recupera {delta}. Difendi settore {sector}.',
    'Dietro si avvicina. Attenzione al settore {sector}.'
  ],
  behindDropping: [
    'Il pilota dietro perde {delta}. Continua pulito.',
    'Dietro perde terreno. Mantieni ritmo.'
  ],
  behindStable: [
    'Gap stabile dietro. Nessuna pressione immediata.'
  ],
  attackWindow: [
    'Sotto il secondo. Se vuoi attaccare, prepara settore {sector}.'
  ]
}
