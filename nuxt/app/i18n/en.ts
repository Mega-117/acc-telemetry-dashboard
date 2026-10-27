// PIP-665: English. Same areas and keys as it.ts; a missing key falls back to Italian and fails the test.
import type { PartialDictionary } from './types'
import shell from './en/shell'
import auth from './en/auth'
import privacy from './en/privacy'
import profile from './en/profile'
import settingsPanels from './en/settingsPanels'
import onboarding from './en/onboarding'

const en: PartialDictionary = {
  ...shell,
  ...auth,
  ...privacy,
  ...profile,
  ...settingsPanels,
  ...onboarding,
}

export default en
