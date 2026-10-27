// PIP-665: Italian, the source language. One file per area under it/ (max-lines); add keys there
// first, then the same keys under en/ (the test lists any gap).
import shell from './it/shell'
import auth from './it/auth'
import privacy from './it/privacy'
import profile from './it/profile'
import settingsPanels from './it/settingsPanels'
import onboarding from './it/onboarding'

export default {
  ...shell,
  ...auth,
  ...privacy,
  ...profile,
  ...settingsPanels,
  ...onboarding,
} as const
