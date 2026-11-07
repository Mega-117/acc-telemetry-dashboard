// PIP-749: the cards of the introduction (the step after them is the command setup).
// One place to change cards and clips. The first card is drawn live (the four pillars);
// the others are looping, muted WebM clips recorded in the game on 07/11, one set per
// language because the labels are burned into the video: `{lang}` becomes 'it' or 'en'.
// The texts are dictionary keys (onboarding.steps.<id>), translated where shown.
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
  /** What else is there, named in a few tags. */
  chips?: readonly TranslationKey[]
  /** Clip of the card, with `{lang}` for the language set; absent when `scene` draws it live. */
  video?: string
  poster?: string
  /** 'welcome': the four pillars drawn in HTML (OnboardingWelcome), sharp at any size. */
  scene?: 'welcome'
}

const clip = (name: string) => ({ video: `/onboarding/v3/{lang}/${name}.webm`, poster: `/onboarding/v3/{lang}/${name}.jpg` })

// PIP-749 (user decision 07/11): the four pillars Live, Automation, Performance, Memory;
// the wheel keys come after, as a question, never as a required step.
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'benvenuto',
    label: 'onboarding.steps.benvenuto.label',
    title: 'onboarding.steps.benvenuto.title',
    accent: 'onboarding.steps.benvenuto.accent',
    text: 'onboarding.steps.benvenuto.text',
    scene: 'welcome',
  },
  {
    id: 'live',
    label: 'onboarding.steps.live.label',
    title: 'onboarding.steps.live.title',
    accent: 'onboarding.steps.live.accent',
    text: 'onboarding.steps.live.text',
    ...clip('02-live'),
  },
  {
    id: 'pannello',
    label: 'onboarding.steps.pannello.label',
    title: 'onboarding.steps.pannello.title',
    accent: 'onboarding.steps.pannello.accent',
    text: 'onboarding.steps.pannello.text',
    ...clip('03-pannello'),
  },
  {
    id: 'guida',
    label: 'onboarding.steps.guida.label',
    title: 'onboarding.steps.guida.title',
    accent: 'onboarding.steps.guida.accent',
    text: 'onboarding.steps.guida.text',
    ...clip('04-guida'),
  },
  {
    id: 'dati',
    label: 'onboarding.steps.dati.label',
    title: 'onboarding.steps.dati.title',
    accent: 'onboarding.steps.dati.accent',
    text: 'onboarding.steps.dati.text',
    ...clip('05-dati'),
  },
]

/** The clip or poster path of a card for the interface language (the labels in the video follow it). */
export function stepMedia(path: string | undefined, locale: 'it' | 'en'): string {
  return (path ?? '').replace('{lang}', locale)
}
