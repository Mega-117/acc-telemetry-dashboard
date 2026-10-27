import { useI18n, type TranslationKey } from '~/i18n'

// Canonical action id (data-overlay-wheel-action, or data-quick-panel-hint for the
// mouse-only layout switch) -> hint text key. Never keyed by visible labels.
const hints: Record<string, TranslationKey> = {
  coach: 'quickPanel.hints.coach',
  references: 'quickPanel.hints.references',
  'pressure-audio': 'quickPanel.hints.pressureAudio',
  'target-voice': 'quickPanel.hints.targetVoice',
  fuel: 'quickPanel.hints.fuel',
  'fuel-session': 'quickPanel.hints.fuelSession',
  pitwall: 'quickPanel.hints.pitwall',
  pressure: 'quickPanel.hints.pressure',
  target: 'quickPanel.hints.target',
  'target-disable': 'quickPanel.hints.targetDisable',
  'sector-references': 'quickPanel.hints.sectorReferences',
  'sector-disable': 'quickPanel.hints.sectorDisable',
  timer: 'quickPanel.hints.timer',
  'layout-vertical': 'quickPanel.hints.layoutVertical',
  'layout-horizontal': 'quickPanel.hints.layoutHorizontal',
  'fuel-minus': 'quickPanel.hints.fuelMinus',
  'fuel-plus': 'quickPanel.hints.fuelPlus',
  'fuel-apply': 'quickPanel.hints.fuelApply',
  // PIP-556: ACC single layout.
  'pressure-test': 'quickPanel.hints.pressureTest',
  'voice-alerts': 'quickPanel.hints.voiceAlerts',
  'voice-close': 'quickPanel.hints.voiceClose',
  notifications: 'quickPanel.hints.notifications',
  'notifications-close': 'quickPanel.hints.notificationsClose',
  'notifications-clear': 'quickPanel.hints.notificationsClear',
}

/** Copy follows the canonical action IDs, independently of input device and language. */
export function quickPanelActionHint(actionId: string | null | undefined): string {
  const { t } = useI18n()
  if (actionId?.startsWith('friend-accept:')) return t('quickPanel.hints.friendAccept')
  if (actionId?.startsWith('friend-reject:')) return t('quickPanel.hints.friendReject')
  return t(actionId && Object.hasOwn(hints, actionId) ? hints[actionId]! : 'quickPanel.hints.none')
}
