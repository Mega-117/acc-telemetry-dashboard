export const PILOT_DIRECTORY_SCHEMA_VERSION = 1

export function normalizePilotDirectoryText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@._ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function addPrefixes(prefixes: Set<string>, value: string) {
  const normalized = normalizePilotDirectoryText(value)
  if (!normalized) return
  const maxLength = Math.min(normalized.length, 32)
  for (let i = 1; i <= maxLength; i++) {
    prefixes.add(normalized.slice(0, i))
  }
}

export function buildPilotSearchPrefixes(input: {
  firstName?: string | null
  lastName?: string | null
  nickname?: string | null
  email?: string | null
}): string[] {
  const firstName = normalizePilotDirectoryText(input.firstName)
  const lastName = normalizePilotDirectoryText(input.lastName)
  const nickname = normalizePilotDirectoryText(input.nickname)
  const email = normalizePilotDirectoryText(input.email)
  const fullName = normalizePilotDirectoryText(`${firstName} ${lastName}`)
  const reverseFullName = normalizePilotDirectoryText(`${lastName} ${firstName}`)
  const emailName = normalizePilotDirectoryText(email.split('@')[0])
  const prefixes = new Set<string>()

  for (const value of [firstName, lastName, nickname, email, emailName, fullName, reverseFullName]) {
    addPrefixes(prefixes, value)
  }

  return Array.from(prefixes).slice(0, 200)
}

export function buildPilotDirectoryFields(input: {
  firstName?: string | null
  lastName?: string | null
  nickname?: string | null
  email?: string | null
}) {
  const firstName = normalizePilotDirectoryText(input.firstName)
  const lastName = normalizePilotDirectoryText(input.lastName)
  const nickname = normalizePilotDirectoryText(input.nickname)
  const email = normalizePilotDirectoryText(input.email)
  const directorySortName = normalizePilotDirectoryText(`${lastName} ${firstName}`) || nickname || email || 'utente'

  return {
    directorySortName,
    searchPrefixes: buildPilotSearchPrefixes({
      firstName,
      lastName,
      nickname,
      email
    })
  }
}

export function buildPilotDirectoryDocument(input: {
  uid: string
  firstName?: string | null
  lastName?: string | null
  nickname?: string | null
  email?: string | null
  role?: string | null
  coachId?: string | null
  sessionsLast7Days?: number | null
  lastSessionDate?: string | null
  suiteVersion?: string | null
  suiteVersionUpdatedAt?: string | null
}) {
  const firstName = input.firstName || ''
  const lastName = input.lastName || ''
  const nickname = input.nickname || normalizePilotDirectoryText(input.email).split('@')[0] || 'Utente'

  return {
    schemaVersion: PILOT_DIRECTORY_SCHEMA_VERSION,
    uid: input.uid,
    firstName,
    lastName,
    nickname,
    role: input.role || 'pilot',
    coachId: input.coachId || null,
    sessionsLast7Days: Number(input.sessionsLast7Days || 0),
    lastSessionDate: input.lastSessionDate || null,
    suiteVersion: input.suiteVersion || null,
    suiteVersionUpdatedAt: input.suiteVersionUpdatedAt || null,
    ...buildPilotDirectoryFields({
      firstName,
      lastName,
      nickname,
      email: input.email
    })
  }
}
