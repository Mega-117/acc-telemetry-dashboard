import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(nuxtRoot, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function readNuxt(relativePath) {
  return fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
}

const rules = read('firestore.rules')
assert.match(rules, /match \/raceCalendar\/\{eventId\}/, 'Missing raceCalendar rules')
assert.match(rules, /match \/coachLessons\/\{lessonId\}/, 'Missing coachLessons rules')
assert.match(rules, /request\.resource\.data\.coachId == request\.auth\.uid/, 'Coach lesson writes must pin coachId to auth uid')
assert.match(rules, /request\.resource\.data\.pilotId == userId/, 'Coach lesson writes must pin pilotId to path userId')
assert.doesNotMatch(rules, /resource\.data\.role == 'coach'/, 'Pilot profile must not expose broad coach directory search in V1')
assert.match(rules, /function preservesRoleAndCoach\(\)/, 'Rules must protect role and coachId from owner self-edit')
assert.match(rules, /allow update: if isOwner\(userId\) && preservesRoleAndCoach\(\)/, 'Users owner update must preserve role and coachId')
assert.match(rules, /allow update: if isAdmin\(\) \|\| \(isOwner\(userId\) && preservesRoleAndCoach\(\)\)/, 'pilotDirectory owner update must preserve role and coachId')

const indexes = JSON.parse(read('firestore.indexes.json'))
function hasPilotDirectoryIndex(expectedFields) {
  return indexes.indexes.some((index) => {
    if (index.collectionGroup !== 'pilotDirectory' || index.queryScope !== 'COLLECTION') return false
    const fields = index.fields.map((field) => `${field.fieldPath}:${field.order || field.arrayConfig}`)
    return JSON.stringify(fields) === JSON.stringify(expectedFields)
  })
}

const profilePage = readNuxt('app/components/ProfilePage.vue')
for (const token of [
  'ProfileRaceCalendarCard',
  'ProfileCoachAssociationCard',
  'ProfileCoachLessonsCard',
  "activeTab === 'equipment'",
  'ffbGain',
  'brakePressure'
]) {
  assert.ok(profilePage.includes(token), `ProfilePage missing ${token}`)
}

const coachAssociation = readNuxt('app/components/profile/CoachAssociationCard.vue')
assert.ok(coachAssociation.includes('Nessun coach assegnato'), 'Coach association card must be read-only display copy')
assert.ok(!coachAssociation.includes('assignCoachToPilot'), 'Pilot profile must not assign coaches directly')
assert.ok(!coachAssociation.includes('searchCoaches'), 'Pilot profile must not search coach directory in V1')

const calendarCard = readNuxt('app/components/profile/RaceCalendarCard.vue')
assert.ok(calendarCard.includes('v-model="form.startsAt" type="datetime-local"'), 'Calendar must use native datetime-local input')
assert.ok(!calendarCard.includes('startsAtDraft'), 'Calendar must not stage date/time with an external confirmation control')
assert.ok(!calendarCard.includes('Conferma'), 'Calendar must not render an external date/time confirmation button')
assert.ok(calendarCard.includes('::-webkit-calendar-picker-indicator'), 'Calendar picker icon must be visible on dark UI')

const pilotDetail = readNuxt('app/pages/piloti/[id].vue')
assert.ok(pilotDetail.includes("{ id: 'lezioni', label: 'LEZIONI' }"), 'Pilot detail missing LEZIONI tab')
assert.ok(pilotDetail.includes("import CoachLessonsPanel from '~/components/coach/CoachLessonsPanel.vue'"), 'Pilot detail must import coach lessons panel explicitly')
assert.ok(pilotDetail.includes('<CoachLessonsPanel'), 'Pilot detail missing coach lessons panel')

const coachLessonsPanel = readNuxt('app/components/coach/CoachLessonsPanel.vue')
for (const token of [
  'Contesto pilota',
  'trackTitanPilotUrl',
  'trackTitanReferenceUrl',
  'recordingUrl',
  'carName',
  "trackedGetDoc(doc(db, 'users', props.pilotId)"
]) {
  assert.ok(coachLessonsPanel.includes(token), `CoachLessonsPanel missing ${token}`)
}

const profileCoachLessons = readNuxt('app/components/profile/CoachLessonsCard.vue')
for (const token of ['lessonLinks', 'activeLesson.carName', 'TrackTitan pilota', 'Registrazione']) {
  assert.ok(profileCoachLessons.includes(token), `Profile coach lessons card missing ${token}`)
}

console.log('[COACH_CALENDAR_FEATURES_CHECK] OK')
