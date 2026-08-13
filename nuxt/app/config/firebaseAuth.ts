import { getAuth } from 'firebase/auth'
import { app } from '~/config/firebase'

// Secondary Electron renderers share persistence with the primary dashboard
// and are authorized by the main process. Import this module only after the
// renderer-role gate so they never initialize Firebase Auth independently.
export const auth = getAuth(app)
