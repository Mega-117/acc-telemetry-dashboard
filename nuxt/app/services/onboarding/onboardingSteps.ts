// PIP-571: the four video cards of the introduction (the fifth step is the command setup).
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
  video: string
  poster: string
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'benvenuto',
    label: 'Racer Core',
    title: 'Ti assiste',
    accent: 'mentre guidi',
    text: 'In pista vedi benzina, pressioni e settori. Dopo trovi tutto qui.',
    video: '/onboarding/01-benvenuto.webm',
    poster: '/onboarding/01-benvenuto.jpg',
  },
  {
    id: 'ctrlk',
    label: 'Pannello rapido',
    title: 'Pannello rapido:',
    accent: 'Ctrl+K',
    text: 'Il centro di Racer Core: da qui comandi tutto. Lo apri con Ctrl+K o dal volante.',
    video: '/onboarding/02-ctrlk.webm',
    poster: '/onboarding/02-ctrlk.jpg',
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
    title: 'Vedi',
    accent: 'quanto manca',
    text: 'Benzina e giri rimasti, pressioni, settori contro il tuo meglio.',
    video: '/onboarding/04-hud.webm',
    poster: '/onboarding/04-hud.jpg',
  },
]
