// PIP-665: English. Same areas and keys as it.ts; a missing key falls back to Italian and fails the test.
import type { PartialDictionary } from './types'
import shell from './en/shell'
import auth from './en/auth'
import privacy from './en/privacy'
import profile from './en/profile'
import settingsPanels from './en/settingsPanels'
import onboarding from './en/onboarding'
import common from './en/common'
import overview from './en/overview'
import sessions from './en/sessions'
import sessionDetail from './en/sessionDetail'
import telemetry from './en/telemetry'
import stats from './en/stats'
import tracks from './en/tracks'
import data from './en/data'

const en: PartialDictionary = {
  ...shell,
  ...auth,
  ...privacy,
  ...profile,
  ...settingsPanels,
  ...onboarding,
  ...common,
  ...overview,
  ...sessions,
  ...sessionDetail,
  ...telemetry,
  ...stats,
  ...tracks,
  ...data,
}

export default en
