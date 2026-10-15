import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// PIP-541: ogni pagina di strumenti per sviluppatori deve dichiarare il gate `dev-tools`
// (solo host locale + ruolo admin). Un nuovo `dev-*.vue` senza gate fallisce qui.
// Eccezione voluta: il Voice Lab e' raggiungibile dagli utenti normali per i riferimenti
// filtrati (`scripts/check_dev_tools_access.mjs` lo impone); i suoi strumenti completi sono
// dietro `hasFullVoiceLabAccess` = solo admin.
const PAGES = join(__dirname, '..', '..', 'app', 'pages')
const devPages = readdirSync(PAGES).filter((name) => name === 'dev.vue' || /^dev-.+\.vue$/.test(name))
const INTERNAL_GATE = new Set(['dev-voice-lab.vue'])

describe('dev tools pages are gated', () => {
  it('finds the dev pages', () => {
    expect(devPages).toContain('dev-voice-lab.vue')
    expect(devPages.length).toBeGreaterThanOrEqual(5)
  })

  it.each(devPages.filter((name) => !INTERNAL_GATE.has(name)))('%s declares the dev-tools middleware', (name) => {
    const source = readFileSync(join(PAGES, name), 'utf8')
    expect(source).toMatch(/definePageMeta\(\{[\s\S]*?middleware:\s*(\[[^\]]*)?['"]dev-tools['"]/)
  })

  it('voice lab keeps its admin-only full-access gate inside the page', () => {
    const source = readFileSync(join(PAGES, 'dev-voice-lab.vue'), 'utf8')
    expect(source).toMatch(/hasFullVoiceLabAccess\s*=\s*computed\(\(\)\s*=>\s*isAdmin\.value\)/)
    expect(source).toContain('v-if="hasFullVoiceLabAccess"')
  })
})
