import process from 'node:process'

const PILOT_DIRECTORY_SCHEMA_VERSION = 1

function normalizePilotDirectoryText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@._ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function addPrefixes(prefixes, value) {
  const normalized = normalizePilotDirectoryText(value)
  if (!normalized) return
  const maxLength = Math.min(normalized.length, 32)
  for (let i = 1; i <= maxLength; i++) {
    prefixes.add(normalized.slice(0, i))
  }
}

function buildPilotSearchPrefixes(input) {
  const firstName = normalizePilotDirectoryText(input.firstName)
  const lastName = normalizePilotDirectoryText(input.lastName)
  const nickname = normalizePilotDirectoryText(input.nickname)
  const email = normalizePilotDirectoryText(input.email)
  const fullName = normalizePilotDirectoryText(`${firstName} ${lastName}`)
  const reverseFullName = normalizePilotDirectoryText(`${lastName} ${firstName}`)
  const emailName = normalizePilotDirectoryText(email.split('@')[0])
  const prefixes = new Set()

  for (const value of [firstName, lastName, nickname, email, emailName, fullName, reverseFullName]) {
    addPrefixes(prefixes, value)
  }

  return Array.from(prefixes).slice(0, 200)
}

function buildPilotDirectoryDocument(data) {
  const firstName = normalizePilotDirectoryText(data.firstName)
  const lastName = normalizePilotDirectoryText(data.lastName)
  const nickname = normalizePilotDirectoryText(data.nickname)
  const email = normalizePilotDirectoryText(data.email)
  const directorySortName = normalizePilotDirectoryText(`${lastName} ${firstName}`) || nickname || email || 'utente'

  return {
    schemaVersion: PILOT_DIRECTORY_SCHEMA_VERSION,
    uid: data.uid,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    nickname: data.nickname || email.split('@')[0] || 'Utente',
    role: data.role || 'pilot',
    coachId: data.coachId || null,
    sessionsLast7Days: Number(data.stats?.sessionsLast7Days || 0),
    lastSessionDate: data.stats?.lastSessionDate || null,
    suiteVersion: data.suiteVersion || null,
    suiteVersionUpdatedAt: data.suiteVersionUpdatedAt || null,
    directorySortName,
    searchPrefixes: buildPilotSearchPrefixes({
      firstName,
      lastName,
      nickname,
      email
    })
  }
}

if (process.env.BACKFILL_USER_DIRECTORY !== '1') {
  console.log('[BACKFILL_USER_DIRECTORY] Dry guard active. Re-run with BACKFILL_USER_DIRECTORY=1 after configuring firebase-admin credentials.')
  process.exit(0)
}

let admin
try {
  const imported = await import('firebase-admin')
  admin = imported.default || imported
} catch {
  console.error('[BACKFILL_USER_DIRECTORY] Missing firebase-admin. Install/use it only in an admin maintenance environment.')
  process.exit(1)
}

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()
const usersSnap = await db.collection('users').get()
let batch = db.batch()
let pending = 0
let updated = 0

for (const docSnap of usersSnap.docs) {
  const data = docSnap.data() || {}
  const directoryDoc = buildPilotDirectoryDocument({
    uid: docSnap.id,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    nickname: data.nickname || '',
    email: data.email || '',
    role: data.role || 'pilot',
    coachId: data.coachId || null,
    stats: data.stats || {},
    suiteVersion: data.suiteVersion || null,
    suiteVersionUpdatedAt: data.suiteVersionUpdatedAt || null
  })

  batch.set(db.collection('pilotDirectory').doc(docSnap.id), directoryDoc, { merge: true })
  pending++
  updated++

  if (pending >= 400) {
    await batch.commit()
    batch = db.batch()
    pending = 0
  }
}

if (pending > 0) {
  await batch.commit()
}

console.log(`[BACKFILL_USER_DIRECTORY] Updated ${updated} pilotDirectory documents`)
