// PIP-571: the four cards of the introduction (the fifth step is the command setup).
// One place to change sentences and clips. Clips live in `public/onboarding/` (looping, muted
// WebM) with a JPG poster as fallback. Each sentence stays short: the clip does the explaining.

export interface OnboardingStep {
  id: string
  /** Short name in the step rail. */
  label: string
  /** First part of the title, in white. */
  title: string
  /** Second part of the title, in red. */
  accent: string
  text: string
  /** Clip of the card; absent when the card shows the live panel copy instead (`scene`). */
  video?: string
  poster?: string
  /** 'panel': the large interactive copy of the pannello rapido (OnboardingPanelShowcase). */
  scene?: 'panel'
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'benvenuto',
    label: 'Racer Core',
    title: 'Ti assiste',
    accent: 'mentre guidi',
    text: 'In pista: classifica, mappa, cruscotto, settori e gomme. Dopo trovi ogni sessione qui.',
    video: '/onboarding/01-benvenuto.webm',
    poster: '/onboarding/01-benvenuto.jpg',
  },
  {
    id: 'ctrlk',
    label: 'Pannello rapido',
    title: 'Pannello rapido:',
    accent: 'Ctrl+K',
    text: 'Il centro di Racer Core: da qui comandi tutto, anche gli avvisi vocali. Lo apri con Ctrl+K o dal volante.',
    scene: 'panel',
  },
  {
    id: 'automazioni',
    label: 'Automazioni',
    title: 'Lui clicca',
    accent: 'per te',
    text: 'Premi Correggi pressioni. Racer Core sistema le gomme da solo.',
    video: '/onboarding/03-automazioni.webm',
    poster: '/onboarding/03-automazioni.jpg',
  },
  {
    id: 'hud',
    label: 'HUD',
    title: 'Gli HUD',
    accent: 'li scegli tu',
    text: 'Ognuno risponde a una domanda di gara. Li accendi e li sposti dalla pagina HUD.',
    video: '/onboarding/04-hud.webm',
    poster: '/onboarding/04-hud.jpg',
  },
]
