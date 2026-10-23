import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveEquipmentSaveOutcome } from '~/utils/equipmentSaveOutcome'

describe('equipment save outcome (PIP-591)', () => {
  const sent = { volante: 'DD1', pedaliera: 'X' }

  it('closes the editor only when what is shown is what was saved', () => {
    expect(resolveEquipmentSaveOutcome({ sentUid: 'a', currentUid: 'a', sent, current: { ...sent } })).toBe('done')
  })

  it('keeps editing when the pilot changed something while the save was in flight', () => {
    expect(resolveEquipmentSaveOutcome({ sentUid: 'a', currentUid: 'a', sent, current: { ...sent, volante: 'DD2' } })).toBe('keep-editing')
  })

  it('leaves the page alone when the account changed while the save was in flight', () => {
    expect(resolveEquipmentSaveOutcome({ sentUid: 'a', currentUid: 'b', sent, current: sent })).toBe('other-account')
    expect(resolveEquipmentSaveOutcome({ sentUid: 'a', currentUid: null, sent, current: sent })).toBe('other-account')
  })

  it('ProfilePage writes and caches the copy taken before the await, for the uid taken before the await', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/ProfilePage.vue'), 'utf8')
    const handler = source.slice(source.indexOf('async function handleSaveEquipment'), source.indexOf("console.error('[PROFILE] Save error:'"))
    expect(handler).toContain("await trackedUpdateDoc(doc(db, 'users', uid), { equipment: sent }, 'ProfilePage')")
    expect(handler).toContain('updateCachedUserProfile(uid, { equipment: sent })')
    expect(handler).toContain('resolveEquipmentSaveOutcome(')
    expect(handler).not.toMatch(/await[\s\S]*equipment: equipment\.value/)
  })
})
