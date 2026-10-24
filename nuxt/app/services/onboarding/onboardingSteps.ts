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
  /** PIP-612: what else is there, named in a few tags instead of one card each. */
  chips?: readonly string[]
  /** Clip of the card; absent when the card shows the live panel copy instead (`scene`). */
  video?: string
  poster?: string
  /** 'panel': the large interactive copy of the pannello rapido (OnboardingPanelShowcase). */
  scene?: 'panel'
}

// PIP-612: two cards only, the promise and the one thing it does for you; then the
// keys (the only task) and "Avvia ACC". The Ctrl+K card is gone: the menu is
// discovered in the key setup, next to the buttons being assigned.
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'benvenuto',
    label: 'Racer Core',
    title: 'Ti aiuta',
    accent: 'in pista',
    text: 'Ti mostra quello che serve mentre guidi, e uno spotter ti avvisa a voce.',
    chips: ['HUD', 'Avvisi vocali', 'Pitwall con un amico'],
    video: '/onboarding/01-benvenuto.webm',
    poster: '/onboarding/01-benvenuto.jpg',
  },
  {
    id: 'automazioni',
    label: 'Automazioni',
    title: 'Racer Core',
    accent: 'clicca per te',
    text: 'Premi un tasto e Racer Core fa le regolazioni nel gioco al posto tuo.',
    chips: ['Correggi pressioni', 'Benzina a minuti', 'Benzina per la sessione'],
    video: '/onboarding/03-automazioni.webm',
    poster: '/onboarding/03-automazioni.jpg',
  },
]
