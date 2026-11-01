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
    drivers: () => [], driversState: () => 'ready', loadDriverNames: async () => {}, listDriverLaps: async () => [], resolveLink: async () => null,
    ...extra,
  }
}

let wrapper: VueWrapper | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = '' })

describe('LapChoiceCard', () => {
  it('shows driver with TU, lap and time, when, status in words and the reason', () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'ref', choice: { ...ref, sessionType: 'race' }, reason: { kind: 'myBest' } } })
    const text = wrapper.text()
    expect(text).toContain('Riferimento')
    expect(text).toContain('Bob117')
    expect(text).toContain('TU')
    expect(text).toContain('Giro 5 · 1:40.000')
    expect(text).toContain('Oggi 10:15 · Gara')
    expect(text).toContain('✓ Valido')
    expect(text).toContain('Perché questo: il tuo giro valido più veloce con questa auto')
  })
  it('the ideal lap is dashed and says it is not a real lap; an unknown status is said, never valid', () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'ref', choice: { ...ref, ideal: true }, idealScope: 'session' } })
    expect(wrapper.classes()).toContain('is-ideal')
    expect(wrapper.text()).toContain('Non è un giro vero — i tuoi settori migliori di questa sessione')
    wrapper.unmount()
    wrapper = mount(LapChoiceCard, { props: { side: 'you', choice: { ...you, status: 'unknown', mine: false, driver: 'Mike' } } })
    expect(wrapper.text()).toContain('? Validità non disponibile')
    expect(wrapper.text()).not.toContain('TU')
    expect(wrapper.text()).not.toContain('Perché questo')
  })
  it('"Cambia" asks to open the chooser', async () => {
    wrapper = mount(LapChoiceCard, { props: { side: 'you', choice: you } })
    await wrapper.get('.lap-card__change').trigger('click')
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
  it('Riferimento opens on Suggeriti; a selected row is used with "Usa questo giro"', async () => {
    const { apply } = openDialog('ref')
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus()
    await wrapper!.setProps({ open: true }); await flushPromises()
    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(dialog()?.textContent).toContain('Cambia il riferimento')
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Suggeriti')
    expect(button('Usa un link')).toBeTruthy()
    expect(rows()).toHaveLength(2)
    expect(rows()[0]!.textContent).toContain('Scelta attuale')
    expect(rows()[0]!.getAttribute('aria-current')).toBe('true')
    expect(rows()[1]!.hasAttribute('aria-current')).toBe(false)
    expect(document.body.querySelector('.choice-dialog__x')?.getAttribute('aria-label')).toBe('Chiudi')
    rows()[1]!.click(); await flushPromises()
    expect(rows()[1]!.getAttribute('aria-pressed')).toBe('true')
    button('Usa questo giro').click(); await flushPromises()
    expect(apply).toHaveBeenCalledWith('ref', expect.objectContaining({ key: 'library:x' }))
    expect(wrapper!.emitted('close')).toHaveLength(1)
  })
  it('says why there is no ideal lap when it is the best lap itself (01/11)', async () => {
    openDialog('ref', undefined, { idealSame: () => true })
    await wrapper!.setProps({ open: true }); await flushPromises()
    expect(dialog()?.textContent).toContain('Giro ideale: è il tuo giro migliore, già il più veloce in tutti e tre i settori.')
  })
  it('Tu opens on its laps only, the session open with the star, others behind "Mostra"', async () => {
    openDialog('you')
    await wrapper!.setProps({ open: true }); await flushPromises()
    expect(document.body.querySelector('[role="tablist"]')).toBeNull()
    expect(dialog()?.textContent).toContain('I miei giri')
    expect(dialog()?.textContent).toContain('Questa sessione')
    expect(dialog()?.textContent).toContain('★ Migliore della sessione')
    expect(dialog()?.textContent).toContain('Prima')
    const show = document.body.querySelector<HTMLButtonElement>('.my-laps__head[aria-expanded]')!
    expect(show.textContent).toContain('Mostra')
    expect(show.textContent).toContain('1 giro')
    expect(show.textContent).not.toContain('1 giri')
    expect(show.getAttribute('aria-expanded')).toBe('false')
    // All these laps are mine: the rows do not repeat my name and TU.
    expect(rows().some(r => r.textContent?.includes('Bob117') || r.querySelector('.choice-row__tag'))).toBe(false)
    show.click(); await flushPromises()
    expect(dialog()?.textContent).toContain('? Validità non disponibile')
  })
  it('Esc and Annulla keep the comparison; the same lap on both sides is refused', async () => {
    const { apply } = openDialog('you')
    await wrapper!.setProps({ open: true }); await flushPromises()
    const refRow = rows().find(r => r.dataset.key === ref.key)!
    expect(refRow.textContent).toContain('Già usato come Riferimento')
    refRow.click(); await flushPromises()
    expect(dialog()?.textContent).toContain('Questo giro è già Riferimento')
    expect(button('Usa questo giro').disabled).toBe(true)
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(wrapper!.emitted('close')).toHaveLength(1)
    button('Annulla').click()
    expect(wrapper!.emitted('close')).toHaveLength(2)
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
    rows().find(r => r.dataset.key === lapKey('me', today, 2))!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await flushPromises()
    expect(apply).not.toHaveBeenCalled()
    expect(dialog()?.textContent).toContain('Questo giro è incompleto')
  })
  it('a lap link shows whose lap it is before it is used', async () => {
    const shared: LapChoice = { ...step, key: 'shared:z', reason: { kind: 'link', driver: 'Mike83' }, driver: 'Mike83' }
    openDialog('ref', undefined, { resolveLink: async () => ({ state: 'lap', choice: shared }) })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Usa un link').click(); await flushPromises()
    const input = document.body.querySelector<HTMLInputElement>('.link-choice input')!
    input.value = `https://app.racercore.app/giro#${'a'.repeat(32)}.${'b'.repeat(32)}`; input.dispatchEvent(new Event('input'))
    await flushPromises()
    button('Controlla il link').click(); await flushPromises()
    expect(dialog()?.textContent).toContain('Giro ricevuto')
    expect(dialog()?.textContent).toContain('Mike83')
    expect(rows()[0]!.getAttribute('aria-pressed')).toBe('true')
    input.value = 'ciao'; input.dispatchEvent(new Event('input')); await flushPromises()
    button('Controlla il link').click(); await flushPromises()
    expect(dialog()?.textContent).toContain('Questo non è il link di un giro o di una sessione')
  })
})

describe('LapChoiceDrivers (Altri piloti)', () => {
  const drivers = () => [
    { uid: 'u2', nickname: 'RICO117', lapTimeMs: 99000, rank: 1, gapMs: -1000, mine: false, libId: 'a', recordedAt: null },
    { uid: 'me', nickname: 'Bob117', lapTimeMs: 100000, rank: 2, gapMs: 0, mine: true, libId: 'b', recordedAt: null },
    { uid: 'u3', nickname: 'Jérôme', lapTimeMs: 100400, rank: 3, gapMs: 400, mine: false, libId: 'c', recordedAt: null },
  ]
  it('a leaderboard with my row, a tolerant search, a driver with their best preselected and the way back', async () => {
    const theirs = [lap(4, 99200, { key: 'u2|t|4', ownerUid: 'u2', driver: null, mine: false }), lap(7, 99000, { key: 'u2|t|7', ownerUid: 'u2', driver: null, mine: false })]
    const listDriverLaps = vi.fn(async () => theirs)
    const loadDriverNames = vi.fn(async () => {})
    openDialog('ref', undefined, { drivers, listDriverLaps, loadDriverNames })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Altri piloti').click(); await flushPromises()
    expect(loadDriverNames).toHaveBeenCalled()
    const list = () => [...document.body.querySelectorAll<HTMLButtonElement>('.driver-row')]
    expect(list()[1]!.querySelector('.driver-row__name')?.textContent).toBe('Bob117 TU')
    expect(list().map(r => r.textContent)).toEqual([expect.stringContaining('RICO117'), expect.stringContaining('TU'), expect.stringContaining('Jérôme')])
    expect(list()[0]!.textContent).toContain('1,000 s più veloce di te')
    const search = document.body.querySelector<HTMLInputElement>('.drivers__search input')!
    search.value = 'jero'; search.dispatchEvent(new Event('input')); await flushPromises()
    expect(list()).toHaveLength(1)
    search.value = 'zzz'; search.dispatchEvent(new Event('input')); await flushPromises()
    expect(dialog()?.textContent).toContain('Nessun pilota contiene “zzz”')
    search.value = 'rico'; search.dispatchEvent(new Event('input')); await flushPromises()
    list()[0]!.click(); await flushPromises()
    expect(listDriverLaps).toHaveBeenCalledWith('u2')
    expect(dialog()?.textContent).toContain('Altri piloti › RICO117')
    expect(rows().find(r => r.getAttribute('aria-pressed') === 'true')?.dataset.key).toBe('u2|t|7')
    button('← Tutti i piloti').click(); await flushPromises()
    expect(list().length).toBeGreaterThan(0)
  })
  it('says what is happening while the leaderboard loads, or why it is not there', async () => {
    openDialog('ref', undefined, { drivers: () => [], driversState: () => 'loading' })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Altri piloti').click(); await flushPromises()
    expect(dialog()?.textContent).toContain('Carico la classifica dei piloti')
    expect(dialog()?.textContent).not.toContain('Nessun altro pilota')
  })
  it('a driver whose laps cannot be read says so', async () => {
    openDialog('ref', undefined, { drivers, listDriverLaps: async () => { throw new Error('rete') } })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Altri piloti').click(); await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.driver-row')!.click(); await flushPromises()
    expect(dialog()?.textContent).toContain('Non riesco a leggere i giri di RICO117: rete')
  })
})

describe('LapChoiceDialog: session link and keyboard', () => {
  it('a session link lists its laps and preselects the proposed one; Tab stays inside', async () => {
    const a = lap(1, 99500, { key: 'u2|s|1', ownerUid: 'u2', mine: false }), b = lap(2, 99000, { key: 'u2|s|2', ownerUid: 'u2', mine: false, status: 'invalid' })
    openDialog('ref', undefined, { resolveLink: async () => ({ state: 'session', choices: [a, b], proposedKey: a.key, driver: 'RICO117', sessionToken: 's' }) })
    await wrapper!.setProps({ open: true }); await flushPromises()
    button('Usa un link').click(); await flushPromises()
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
