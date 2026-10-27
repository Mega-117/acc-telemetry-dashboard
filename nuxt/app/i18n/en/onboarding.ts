import type { PartialDictionary } from '../types'

export default {
  onboarding: {
    dialog: 'Introduction to Racer Core',
    rail: 'Introduction steps',
    commandsStep: 'Controls',
    skip: 'Skip',
    later: 'I will do it later',
    laterDialog: 'Set the keys later?',
    laterText: 'Without keys, the on-track menu opens only with Ctrl+K. You can set them any time in Settings → Controls.',
    laterCancel: 'Set them now',
    laterConfirm: 'Yes, later',
    navigation: 'Navigation',
    previous: 'Back',
    next: 'Next',
    finishTitle: 'Ready',
    finishAccent: 'for the track',
    finishLater: 'You can set the wheel keys any time in Settings → Controls.',
    menu: 'Menu',
    start: 'Start',
    steps: {
      benvenuto: {
        label: 'Racer Core',
        title: 'It helps you',
        accent: 'on track',
        text: 'It shows what you need while you drive, and a spotter warns you by voice.',
        chipHud: 'HUD',
        chipVoice: 'Voice alerts',
        chipPitwall: 'Pitwall with a friend',
      },
      automazioni: {
        label: 'Automations',
        title: 'Racer Core',
        accent: 'clicks for you',
        text: 'Press a key and Racer Core makes the in-game adjustments for you.',
        chipPressures: 'Fix pressures',
        chipFuelMinutes: 'Fuel by minutes',
        chipFuelSession: 'Fuel for the session',
      },
    },
  },
} satisfies PartialDictionary
