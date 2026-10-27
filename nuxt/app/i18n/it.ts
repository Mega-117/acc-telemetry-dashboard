// PIP-665: Italian, the source language. One file per area under it/ (max-lines); add keys there
// first, then the same keys under en/ (the test lists any gap).
import shell from './it/shell'
import auth from './it/auth'
import privacy from './it/privacy'
import profile from './it/profile'
import settingsPanels from './it/settingsPanels'
import onboarding from './it/onboarding'
import common from './it/common'
import overview from './it/overview'
import sessions from './it/sessions'
import sessionDetail from './it/sessionDetail'
import telemetry from './it/telemetry'
import stats from './it/stats'
import tracks from './it/tracks'
import data from './it/data'

export default {
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
} as const
