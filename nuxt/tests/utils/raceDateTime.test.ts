// @vitest-environment jsdom
// PIP-641: the site's date and time picker for a planned race, and the checks of the race form.
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RaceDateTimePicker from '~/components/overview/RaceDateTimePicker.vue'
import { validateRaceForm } from '~/utils/raceCalendarForm'
import { addDays, displayRaceDateTime, formatRaceDateTime, monthCells, parseRaceDateTime, parseTimePart } from '~/utils/raceDateTime'

describe('race date helpers', () => {
  it('reads and writes the calendar format, rejecting impossible dates', () => {
    const value = parseRaceDateTime('2026-10-28T20:50')
    expect(value).toEqual({ year: 2026, month: 9, day: 28, hour: 20, minute: 50 })
    expect(formatRaceDateTime(value!)).toBe('2026-10-28T20:50')
    expect(parseRaceDateTime('2026-02-30T20:00')).toBeNull()
    expect(parseRaceDateTime('')).toBeNull()
  })

  it('builds six weeks starting on Monday', () => {
    const cells = monthCells(2026, 9) // October 2026 starts on a Thursday
    expect(cells).toHaveLength(42)
    expect(cells[0]).toEqual({ year: 2026, month: 8, day: 28, inMonth: false })
    expect(cells[3]).toEqual({ year: 2026, month: 9, day: 1, inMonth: true })
  })

  it('moves across months and parses typed times', () => {
    expect(addDays({ year: 2026, month: 9, day: 31 }, 1)).toEqual({ year: 2026, month: 10, day: 1 })
    expect(parseTimePart('07', 23)).toBe(7)
    expect(parseTimePart('24', 23)).toBeNull()
    expect(parseTimePart('x', 59)).toBeNull()
    expect(displayRaceDateTime({ year: 2026, month: 9, day: 28, hour: 20, minute: 5 })).toMatch(/^Mer 28 ott 2026 · 20:05$/)
  })
})

describe('validateRaceForm', () => {
  const ok = { title: 'Gara', startsAt: '2099-01-01T21:00', trackName: 'Spa', carName: '', simGridUrl: '', raceUrl: '' }
  it('returns one message per wrong field', () => {
    expect(validateRaceForm(ok, Date.now())).toEqual({})
    expect(validateRaceForm({ ...ok, title: ' ', trackName: '', startsAt: '' }, Date.now()))
      .toEqual({ title: 'Scrivi il titolo della gara.', trackName: 'Scrivi la pista.', startsAt: 'Scegli data e ora.' })
  })
  it('refuses a past date and links without http(s)', () => {
    const errors = validateRaceForm({ ...ok, startsAt: '2020-01-01T21:00', raceUrl: 'discord.gg/x' }, Date.now())
    expect(errors.startsAt).toBe('Questa data è già passata.')
    expect(errors.raceUrl).toBe('Il link deve iniziare con https://')
  })
})

describe('RaceDateTimePicker', () => {
  it('picks a day keeping the default evening time, then edits the time', async () => {
    const view = mount(RaceDateTimePicker, { props: { modelValue: '' } })
    expect(view.text()).toContain('Scegli data e ora')
    await view.get('.dt-picker__field').trigger('click')
    const day15 = view.findAll('.dt-picker__day').find(b => b.text() === '15' && !b.classes('is-out'))!
    await day15.trigger('click')
    const picked = view.emitted('update:modelValue')!.at(-1)![0] as string
    expect(picked).toMatch(/-15T21:00$/)
    await view.setProps({ modelValue: picked })
    const [hour, minute] = view.findAll('.dt-picker__time input')
    await hour!.setValue('19'); await hour!.trigger('change')
    await minute!.setValue('30'); await minute!.trigger('change')
    expect(view.emitted('update:modelValue')!.at(-1)![0]).toBe(picked.replace('T21:00', 'T19:30'))
  })

  it('closes on Escape without letting the modal close too', async () => {
    const view = mount(RaceDateTimePicker, { props: { modelValue: '2099-10-02T18:00' }, attachTo: document.body })
    await view.get('.dt-picker__field').trigger('click')
    expect(view.find('.dt-picker__panel').exists()).toBe(true)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    let reachedParent = false
    document.body.addEventListener('keydown', () => { reachedParent = true }, { once: true })
    view.get('.dt-picker__day').element.dispatchEvent(event)
    await view.vm.$nextTick()
    expect(view.find('.dt-picker__panel').exists()).toBe(false)
    expect(reachedParent).toBe(false)
    view.unmount()
  })
})
