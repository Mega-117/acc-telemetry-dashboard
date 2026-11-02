// @vitest-environment jsdom
// PIP-695: the two lap cards and the "Cambia" chooser.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import LapChoiceCard from '~/components/session-detail/analysis/LapChoiceCard.vue'
import LapChoiceDialog from '~/components/session-detail/analysis/LapChoiceDialog.vue'
import { lapKey, type LapChoice } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource } from '~/composables/useLapChoice'

vi.mock('~/repositories/publicProfileRepository', () => ({ loadPublicNickname: vi.fn(async () => null) }))
setLocale('it')

const today = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_101500` })()
const lap = (n: number, ms: number, o: Partial<LapChoice> = {}): LapChoice => ({ key: lapKey('me', today, n), ref: { kind: 'entry', id: `e${n}` }, ownerUid: 'me', driver: 'Bob117', mine: true,
  lapNumber: n, lapTimeMs: ms, sessionToken: today, status: 'valid', ...o })
const you = lap(3, 101000)
const ref = lap(5, 100000)
const step: LapChoice = { key: 'library:x', ref: { kind: 'entry', id: 'library:x' }, ownerUid: 'u2', driver: 'RICO117', mine: false, lapNumber: null, lapTimeMs: 99000, sessionToken: null, status: 'valid',
  reason: { kind: 'stepUp', driver: 'RICO117', pct: 1 } }

function source(extra: Partial<LapChoiceSource> = {}): LapChoiceSource {
  return {
    subjectName: () => null,
    currentKey: side => side === 'you' ? you.key : ref.key,
    suggested: () => [{ ...ref, reason: { kind: 'myBest' } }, step],
    sessionLaps: () => [lap(1, 102000, { status: 'invalid' }), lap(2, 0, { status: 'incomplete' }), you, ref],
    listMine: async () => ({ laps: [lap(1, 100500, { sessionToken: '20260101_100000', key: lapKey('me', '20260101_100000', 1), status: 'unknown' })], truncated: false }),
    sessionBests: async () => ({}),
    drivers: () => [], driversState: () => 'ready', loadDriverNames: async () => {}, resolveLink: async () => null,
    ...extra,
  }
}

let wrapper: VueWrapper | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = '' })

describe('LapChoiceCard', () => {
  // 01/11 (pill): one low line; when it was driven in the tooltip, the reason behind ⓘ (opens on click too).
  it('shows driver with TU, lap and time, status in words; when in the tooltip, the reason behind ⓘ', async () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'ref', choice: { ...ref, sessionType: 'race' }, reason: { kind: 'myBest' } } })
    const text = wrapper.text()
    expect(text).toContain('Riferimento')
    expect(text).toContain('Bob117')
    expect(wrapper.find('.lap-pill__you').exists()).toBe(false) // 01/11: no TU tag beside the name
    expect(wrapper.get('.lap-pill__lap').text()).toBe('G5')
    expect(wrapper.get('.lap-pill__time').text()).toBe('1:40.000')
    expect(wrapper.get('.lap-pill__body').attributes('title')).toContain('Oggi 10:15 · Gara')
    // 01/11: a valid lap shows no tick; an invalid one is its red time, the word for screen readers only.
    expect(wrapper.find('.lap-pill__status').exists()).toBe(false)
    expect(wrapper.get('.lap-pill__main .sr-only').text()).toBe('Valido')
    expect(wrapper.get('.lap-pill__time').classes()).not.toContain('is-invalid')
    const why = wrapper.get('.lap-pill__why')
    expect(why.attributes('aria-label')).toContain('Perché questo: il tuo giro valido più veloce con questa auto')
    expect(text).not.toContain('Perché questo')
    // Keyboard and touch: ⓘ opens the reason and what the tooltip holds.
    await why.trigger('click')
    expect(wrapper.findAll('.lap-pill__reason').map(p => p.text())).toEqual(['Perché questo: il tuo giro valido più veloce con questa auto', expect.stringContaining('Oggi 10:15 · Gara')])
  })
  it('the ideal lap is dashed and says it is not a real lap; an unknown status is said, never valid', () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'ref', choice: { ...ref, ideal: true }, idealScope: 'session' } })
    expect(wrapper.classes()).toContain('is-ideal')
    expect(wrapper.get('.lap-pill__body').attributes('title')).toContain('Non è un giro vero — i tuoi settori migliori di questa sessione')
    expect(wrapper.get('.lap-pill__lap').text()).toBe('Ideale')
    wrapper.unmount()
    wrapper = mount(LapChoiceCard, { props: { side: 'you', choice: { ...you, status: 'unknown', mine: false, driver: 'Mike' } } })
    expect(wrapper.get('.lap-pill__status').text()).toBe('?Validità non disponibile') // icon + screen-reader words
    expect(wrapper.text()).not.toContain('TU')
    expect(wrapper.get('.lap-pill__why').attributes('aria-label')).not.toContain('Perché questo')
  })
  // Codex 01/11: Esc closes the box and is marked handled (the charts keep their corner); a click elsewhere closes it too.
  it('ⓘ: Esc closes the box without reaching the page shortcuts; a click outside closes it', async () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'ref', choice: ref, reason: { kind: 'myBest' } }, attachTo: document.body })
    await wrapper.get('.lap-pill__why').trigger('click')
    expect(wrapper.find('.lap-pill__info').exists()).toBe(true)
    let reachedPage = false
    const page = (e: KeyboardEvent) => { reachedPage = !e.defaultPrevented }
    window.addEventListener('keydown', page)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    window.removeEventListener('keydown', page)
    await flushPromises()
    expect(wrapper.find('.lap-pill__info').exists()).toBe(false)
    expect(reachedPage).toBe(false)
    await wrapper.get('.lap-pill__why').trigger('click')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('.lap-pill__info').exists()).toBe(false)
  })
  it('an invalid lap: red time, no sign, the word kept for screen readers (01/11)', () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'you', choice: { ...you, status: 'invalid' } } })
    expect(wrapper.get('.lap-pill__time').classes()).toContain('is-invalid')
    expect(wrapper.findAll('.lap-pill__status [aria-hidden="true"]')).toHaveLength(0)
    expect(wrapper.get('.lap-pill__status .sr-only').text()).not.toBe('')
  })
  it('shows what the lap was driven with: fuel, tyres, air and track (01/11)', () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'you', choice: { ...you, conditions: { fuelL: 43.73, tyre: 'dry', airC: 15.2, roadC: 18.4 } } } })
    // 01/11: short tags on the pill, the full words in the tooltip.
    expect(wrapper.findAll('.lap-pill__tags span').map(s => s.text())).toEqual(['44 L', 'AIR 15°', 'TRK 18°'])
    expect(wrapper.get('.lap-pill__body').attributes('title')).toContain('Benzina 43,7 L · Gomme da asciutto · Aria 15° · Asfalto 18°')
    wrapper.unmount()
    wrapper = mount(LapChoiceCard, { props: { side: 'you', choice: { ...you, conditions: { fuelL: null, tyre: 'wet', airC: null, roadC: 12 } } } })
    expect(wrapper.findAll('.lap-pill__tags span').map(s => s.text())).toEqual(['TRK 12°'])
    expect(wrapper.text()).not.toContain(' L')
  })
  it('no ✕ on the pills any more: taking the reference away is in Cambia (01/11)', () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'ref', choice: ref } })
    expect(wrapper.find('.lap-pill__remove').exists()).toBe(false)
    expect(wrapper.get('.lap-pill__change svg').exists()).toBe(true)
  })
  it('"Cambia" asks to open the chooser', async () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'you', choice: you } })
    await wrapper.get('.lap-pill__change').trigger('click')
    expect(wrapper.emitted('change')).toHaveLength(1)
  })
})

function openDialog(side: 'you' | 'ref', apply = vi.fn(async () => null as string | null), extra: Partial<LapChoiceSource> = {}) {
  wrapper = mount(LapChoiceDialog, { props: { open: false, side, source: source(extra), apply }, attachTo: document.body })
  return { apply }
}
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const rows = () => [...document.body.querySelectorAll<HTMLButtonElement>('.choice-row')]
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!

describe('LapChoiceDialog', () => {
  it('Riferimento opens on Suggeriti; one click on a row uses it (01/11: no Usa / Annulla buttons)', async () => {
    const { apply } = openDialog('ref')
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus()
    await wrapper!.setProps({ open: true }); await flushPromises()
    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(dialog()?.textContent).toContain('Cambia il riferimento')
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Suggeriti')
    // 02/11 (user, as Track Titan): three tabs, the link inside Altri piloti, no "Nessun riferimento".
    expect([...document.body.querySelectorAll('[role="tab"]')].map(e => e.textContent)).toEqual(['Suggeriti', 'I miei giri', 'Altri piloti'])
    expect(document.body.querySelector('.choice-none')).toBeNull()
    expect(rows()).toHaveLength(2)
    // Name, tags and time: no lap number, no date; the "why" only when it says something.
    expect(rows()[0]!.querySelector('.choice-row__lap')).toBeNull()
    expect(rows()[0]!.textContent).not.toContain('Perché questo')
    expect(rows()[1]!.querySelector('.choice-row__reason')?.textContent).toBe('1% più veloce')
    // Columns as in I miei giri; no fuel known here, so no Best qualifica / gara label.
    expect(rows().every(r => r.classList.contains('is-aligned'))).toBe(true)
    expect(rows()[0]!.querySelector('.choice-row__kind')?.classList.contains('is-none')).toBe(true)
    expect(rows()[0]!.textContent).toContain('Scelta attuale')
    expect(rows()[0]!.getAttribute('aria-current')).toBe('true')
    expect(rows()[1]!.hasAttribute('aria-current')).toBe(false)
    expect(document.body.querySelector('.choice-dialog__x')?.getAttribute('aria-label')).toBe('Chiudi')
    expect(button('Usa questo giro')).toBeUndefined()
    expect(button('Annulla')).toBeUndefined()
    rows()[1]!.click(); await flushPromises()
    expect(apply).toHaveBeenCalledWith('ref', expect.objectContaining({ key: 'library:x' }))
    expect(wrapper!.emitted('close')).toHaveLength(1)
  })
  // 02/11 (user, as Track Titan): I miei giri = the best laps, this session, then one row per past session with its
  // best qualifying and race lap (session summaries); a click on a time uses that lap, the row opens its laps.
  it('I miei giri lists past sessions with their qualifying and race lap', async () => {
    const old = '20260101_100000'
    const q = lap(1, 100500, { sessionToken: old, key: lapKey('me', old, 1), status: 'unknown' })
    const r = lap(8, 103200, { sessionToken: old, key: lapKey('me', old, 8), status: 'unknown' })
    const other = lap(5, 104000, { sessionToken: old, key: lapKey('me', old, 5), status: 'unknown' })
    const { apply } = openDialog('ref', undefined, { listMine: async () => ({ laps: [q, other, r], truncated: false }),
      sessionBests: async () => ({ [old]: { qualifyMs: 100500, raceMs: 103200, qualifyConditions: { fuelL: null, tyre: null, airC: 14, roadC: 20, grip: 'optimum' } } }) })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('I miei giri').click(); await flushPromises()
    expect(dialog()?.textContent).toContain('In evidenza')
    expect(dialog()?.textContent).toContain('Le tue sessioni')
    // 02/11 (user): only the best laps of a past session, as rows (lap, date, tags, Qualifica / Gara); no list to open.
    const past = rows().filter(e => e.querySelector('.choice-row__kind:not(.is-none)'))
    expect(past.map(e => e.querySelector('.choice-row__kind')?.textContent)).toEqual(['Best qualifica', 'Best gara'])
    expect(past[0]!.querySelector('.choice-row__kind')?.classList.contains('is-qualify')).toBe(true)
    expect(past[0]!.querySelector('.choice-row__lap')?.textContent).toBe('Giro 1')
    expect(past[0]!.querySelector('.choice-row__tags')?.textContent).toContain('AIR 14°')
    expect(document.body.querySelector('.my-session__head')).toBeNull()
    expect(rows().some(e => e.dataset.key === lapKey('me', old, 5))).toBe(false)
    past[1]!.click(); await flushPromises()
    expect(apply).toHaveBeenCalledWith('ref', expect.objectContaining({ key: r.key }))
  })
  it('says why there is no ideal lap when it is the best lap itself (01/11)', async () => {
    openDialog('ref', undefined, { idealSame: () => true })
    await wrapper!.setProps({ open: true }); await flushPromises()
    expect(dialog()?.textContent).toContain('Giro ideale: è il tuo giro migliore, già il più veloce in tutti e tre i settori.')
  })
  // 02/11 (user, as Track Titan): "Tu" only among the laps of this session, in lap order; no other sessions.
  it('Tu lists only the laps of this session, in lap order, with the star', async () => {
    openDialog('you')
    await wrapper!.setProps({ open: true }); await flushPromises()
    expect(document.body.querySelector('[role="tablist"]')).toBeNull()
    expect(dialog()?.textContent).toContain('Giri di questa sessione')
    expect(dialog()?.textContent).not.toContain('Prima')
    expect(document.body.querySelector('.my-laps__head')).toBeNull()
    expect(rows().map(r => r.querySelector('.choice-row__lap')?.textContent)).toEqual(['Giro 1', 'Giro 2', 'Giro 3'])
    // Lap 5 is the Riferimento: not listed (02/11, no lap against itself).
    // All these laps are mine: the rows do not repeat my name.
    expect(rows().some(r => r.textContent?.includes('Bob117'))).toBe(false)
    expect(dialog()?.textContent).not.toContain('Benzina')
  })
  // 02/11 (user): the lap already used on the other side is not listed: no "Scambia con …", no lap against itself.
  it('Esc keeps the comparison; the lap of the other side is not listed', async () => {
    const { apply } = openDialog('you')
    await wrapper!.setProps({ open: true }); await flushPromises()
    expect(rows().some(r => r.dataset.key === ref.key)).toBe(false)
    expect(dialog()?.textContent).not.toContain('Scambia')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(wrapper!.emitted('close')).toHaveLength(1)
    expect(apply).not.toHaveBeenCalled()
  })
  it('an error while loading the lap is shown and the dialog stays open; Enter on a row confirms', async () => {
    const apply = vi.fn(async () => 'Archivio giri non raggiungibile: controlla la connessione.')
    openDialog('you', apply)
    await wrapper!.setProps({ open: true }); await flushPromises()
    const first = rows().find(r => r.dataset.key === lapKey('me', today, 1))!
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flushPromises()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(dialog()?.textContent).toContain('Archivio giri non raggiungibile')
    expect(wrapper!.emitted('close')).toBeUndefined()
  })
  it('an incomplete lap cannot be used', async () => {
    const { apply } = openDialog('you')
    await wrapper!.setProps({ open: true }); await flushPromises()
    rows().find(r => r.dataset.key === lapKey('me', today, 2))!.click(); await flushPromises()
    expect(apply).not.toHaveBeenCalled()
    expect(dialog()?.textContent).toContain('Questo giro è incompleto')
  })
  // 02/11 (user): "Confronta" uses a lap link at once.
  it('a lap link is used at once with Confronta', async () => {
    const shared: LapChoice = { ...step, key: 'shared:z', reason: { kind: 'link', driver: 'Mike83' }, driver: 'Mike83' }
    const apply = vi.fn(async () => 'Archivio giri non raggiungibile')
    openDialog('ref', apply, { resolveLink: async () => ({ state: 'lap', choice: shared }) })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Altri piloti').click(); await flushPromises()
    button('Hai un link condiviso?').click(); await flushPromises()
    const input = document.body.querySelector<HTMLInputElement>('.link-choice input')!
    input.value = `https://app.racercore.app/giro#${'a'.repeat(32)}.${'b'.repeat(32)}`; input.dispatchEvent(new Event('input'))
    await flushPromises()
    button('Confronta').click(); await flushPromises()
    expect(apply).toHaveBeenCalledWith('ref', expect.objectContaining({ key: 'shared:z' }))
    // An error while loading it keeps the window open with the reason.
    expect(dialog()?.textContent).toContain('Archivio giri non raggiungibile')
    input.value = 'ciao'; input.dispatchEvent(new Event('input')); await flushPromises()
    button('Confronta').click(); await flushPromises()
    expect(dialog()?.textContent).toContain('Questo non è il link di un giro o di una sessione')
  })
})

describe('LapChoiceDrivers (Altri piloti)', () => {
  const libLap = (uid: string, nickname: string, ms: number, libId: string, extra: Partial<LapChoice> = {}): LapChoice => ({ key: `library:${libId}`,
    ref: { kind: 'library', libId, uid }, ownerUid: uid, driver: nickname, mine: uid === 'me', lapNumber: null, lapTimeMs: ms, sessionToken: null, status: 'valid', ...extra })
  const drivers = () => [
    { rank: 1, uid: 'u2', nickname: 'RICO117', mine: false, kind: 'qualify' as const, entry: { libId: 'a', uid: 'u2', lapTimeMs: 99000, recordedAt: null },
      choice: libLap('u2', 'RICO117', 99000, 'a', { conditions: { fuelL: 9, tyre: null, airC: 15, roadC: 18, grip: 'optimum' } }) },
    { rank: 1, uid: 'u2', nickname: 'RICO117', mine: false, kind: 'race' as const, entry: { libId: 'b', uid: 'u2', lapTimeMs: 101000, recordedAt: null },
      choice: libLap('u2', 'RICO117', 101000, 'b') },
    { rank: 2, uid: 'u3', nickname: 'Jérôme', mine: false, kind: 'qualify' as const, entry: { libId: 'c', uid: 'u3', lapTimeMs: 100400, recordedAt: null },
      choice: libLap('u3', 'Jérôme', 100400, 'c') },
  ]
  // 02/11 (user): two rows per driver at most (Best qualifica / Best gara); a click uses the lap; no list of laps.
  it('lists best qualifying and race rows, searches by nickname, a click uses the lap', async () => {
    const loadDriverNames = vi.fn(async () => {})
    const { apply } = openDialog('ref', undefined, { drivers, loadDriverNames })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Altri piloti').click(); await flushPromises()
    expect(loadDriverNames).toHaveBeenCalled()
    expect(rows().map(r => r.querySelector('.choice-row__kind')?.textContent)).toEqual(['Best qualifica', 'Best gara', 'Best qualifica'])
    expect(rows()[0]!.querySelector('.choice-row__tags')?.textContent).toContain('9 L')
    const search = document.body.querySelector<HTMLInputElement>('.drivers__search input')!
    search.value = 'jero'; search.dispatchEvent(new Event('input')); await flushPromises()
    expect(rows()).toHaveLength(1)
    search.value = 'zzz'; search.dispatchEvent(new Event('input')); await flushPromises()
    expect(dialog()?.textContent).toContain('Nessun pilota contiene “zzz”')
    search.value = 'rico'; search.dispatchEvent(new Event('input')); await flushPromises()
    rows()[1]!.click(); await flushPromises()
    expect(apply).toHaveBeenCalledWith('ref', expect.objectContaining({ key: 'library:b' }))
    expect(document.body.querySelector('.drivers__crumb')).toBeNull()
  })
  it('says what is happening while the leaderboard loads, or why it is not there', async () => {
    openDialog('ref', undefined, { drivers: () => [], driversState: () => 'loading' })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Altri piloti').click(); await flushPromises()
    expect(dialog()?.textContent).toContain('Carico la classifica dei piloti')
    expect(dialog()?.textContent).not.toContain('Nessun altro pilota')
  })
})

describe('LapChoiceDialog: session link and keyboard', () => {
  it('a session link lists its laps and preselects the proposed one; Tab stays inside', async () => {
    const a = lap(1, 99500, { key: 'u2|s|1', ownerUid: 'u2', mine: false }), b = lap(2, 99000, { key: 'u2|s|2', ownerUid: 'u2', mine: false, status: 'invalid' })
    openDialog('ref', undefined, { resolveLink: async () => ({ state: 'session', choices: [a, b], proposedKey: a.key, driver: 'RICO117', sessionToken: 's' }) })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Altri piloti').click(); await flushPromises()
    button('Hai un link condiviso?').click(); await flushPromises()
    const input = document.body.querySelector<HTMLInputElement>('.link-choice input')!
    input.value = 'https://x/sessioni/abc?userId=u2'; input.dispatchEvent(new Event('input')); await flushPromises()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flushPromises()
    expect(dialog()?.textContent).toContain('Sessione di RICO117')
    expect(dialog()?.textContent).toContain('Ti propongo il giro valido più veloce')
    expect(rows().find(r => r.getAttribute('aria-pressed') === 'true')?.dataset.key).toBe(a.key)
    const focusables = [...dialog()!.querySelectorAll<HTMLElement>('button:not([disabled]), input')]
    focusables[focusables.length - 1]!.focus()
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(focusables[0])
    const tabs = [...document.body.querySelectorAll<HTMLElement>('[role="tab"]')]
    tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await flushPromises()
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('I miei giri')
  })
})
