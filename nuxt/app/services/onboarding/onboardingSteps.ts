// PIP-571: the four cards of the introduction (the fifth step is the command setup).
// One place to change cards and clips. Clips live in `public/onboarding/` (looping, muted
// WebM) with a JPG poster as fallback. Each sentence stays short: the clip does the explaining.
// PIP-665: the texts are dictionary keys (onboarding.steps.<id>), translated where shown.
import type { TranslationKey } from '~/i18n'

export interface OnboardingStep {
  id: string
  /** Short name in the step rail. */
  label: TranslationKey
  /** First part of the title, in white. */
  title: TranslationKey
  /** Second part of the title, in red. */
  accent: TranslationKey
  text: TranslationKey
  /** PIP-612: what else is there, named in a few tags instead of one card each. */
  chips?: readonly TranslationKey[]
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
    label: 'onboarding.steps.benvenuto.label',
    title: 'onboarding.steps.benvenuto.title',
    accent: 'onboarding.steps.benvenuto.accent',
    text: 'onboarding.steps.benvenuto.text',
    chips: ['onboarding.steps.benvenuto.chipHud', 'onboarding.steps.benvenuto.chipVoice', 'onboarding.steps.benvenuto.chipPitwall'],
    video: '/onboarding/01-benvenuto.webm',
    poster: '/onboarding/01-benvenuto.jpg',
  },
  {
    id: 'automazioni',
    label: 'onboarding.steps.automazioni.label',
    title: 'onboarding.steps.automazioni.title',
    accent: 'onboarding.steps.automazioni.accent',
    text: 'onboarding.steps.automazioni.text',
    chips: ['onboarding.steps.automazioni.chipPressures', 'onboarding.steps.automazioni.chipFuelMinutes', 'onboarding.steps.automazioni.chipFuelSession'],
    video: '/onboarding/03-automazioni.webm',
    poster: '/onboarding/03-automazioni.jpg',
  },
]
