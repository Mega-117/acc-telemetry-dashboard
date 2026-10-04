// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import CommonSessionDetail from '~/components/sessions/CommonSessionDetail.vue'
import GameSelector from '~/components/layout/GameSelector.vue'
import CommonGamePage from '~/components/pages/CommonGamePage.vue'
import { useGameContext } from '~/composables/useGameContext'
const fixture = vi.hoisted(() => ({ gateway: vi.fn(), overview: vi.fn().mockResolvedValue(null), live: null as any, admin: null as any }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => ({ getSessionsPage: fixture.gateway, getCommonHistoryOverview: fixture.overview }) }))
vi.mock('~/composables/usePilotContext', () => ({ useTargetUserId: () => ref('qa') }))
vi.mock('~/composables/useDevToolsAccess', () => ({ useDevToolsAccess: () => ({ canAccessDevTools: fixture.admin }) }))
vi.mock('~/composables/useFastStatePoller', () => ({ useFastStatePoller: () => ({ fastState: fixture.live, startFastStatePolling: vi.fn(), stopFastStatePolling: vi.fn() }) }))
describe('common game surfaces', () => {
  it('keeps session navigation inside the provided pilot context', async () => {
    fixture.gateway.mockReset().mockResolvedValue({ sessions: [{ sessionId: 'pilot-session', meta: { track: 'Spa', car: 'QA' }, summary: { laps: 2 } }] })
    fixture.overview.mockResolvedValue(null)
    useGameContext().selectGame('evo')
    const view = mount(CommonGamePage, { props: { embedded: true }, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    await view.get('li button').trigger('click')
    expect(view.emitted('go-to-session')).toEqual([['pilot-session']])
    expect(view.find('a[href^="/sessioni"]').exists()).toBe(false)
    view.unmount(); useGameContext().selectGame('acc')
  })
  it('renders complete scoped overview and rejects a late response from the previous game', async () => {
    fixture.gateway.mockReset().mockResolvedValue({ sessions: [] })
    let finishOld!: (value: unknown) => void
    fixture.overview.mockReset().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
      .mockResolvedValueOnce({ gameId: 'synthetic', sessions: 7, laps: 14, validLaps: 0, totalTimeMs: 420000,
        groups: [{ key: 's', track: 'Spa', variant: 'short', car: 'QA Electric', sessions: 7, validLaps: 0, bestMs: null }],
        activity: { cruise: { sessions: 7, minutes: 7 } } })
    useGameContext().selectGame('evo')
    const view = mount(CommonGamePage, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    useGameContext().selectGame('synthetic', true); await flushPromises()
    finishOld({ groups: [{ track: 'WRONG EVO' }] }); await flushPromises()
    expect(fixture.overview).toHaveBeenLastCalledWith('qa', 'synthetic', undefined)
    expect(view.get('dl').text()).toContain('Sessioni7')
    expect(view.text()).toContain('QA Electric')
    expect(view.text()).toContain('Guida libera')
    expect(view.text()).not.toContain('WRONG EVO')
    expect(view.get('tbody tr').text()).toContain('—')
    view.unmount(); useGameContext().selectGame('acc'); fixture.overview.mockReset().mockResolvedValue(null)
  })
  it('changes consulted game only by user selection and hides synthetic for ordinary accounts', async () => {
    useGameContext().selectGame('acc')
    fixture.admin=ref(false); fixture.live=ref({commonLive:null})
    const view=mount(GameSelector)
    expect(view.findAll('.game-options button')[1]!.text()).toContain('Sperimentale')
    expect(view.findAll('.game-options img')).toHaveLength(2)
    expect(view.findAll('.game-options button')).toHaveLength(2)
    await view.findAll('.game-options button')[1]!.trigger('click')
    fixture.live.value={commonLive:{connected:true,gameId:'acc'}}
    await flushPromises()
    expect(view.get('summary').attributes('aria-label')).toContain('EVO')
    expect(view.text()).toContain('Connesso: ACC')
    fixture.admin.value=true; await flushPromises()
    await view.findAll('.game-options button')[2]!.trigger('click')
    expect(useGameContext().consultedGame.value).toBe('synthetic')
    view.unmount(); useGameContext().selectGame('acc')
  })
  it('loads experimental EVO history with its own game scope', async () => {
    fixture.gateway.mockClear(); fixture.gateway.mockResolvedValueOnce({sessions:[]}); useGameContext().selectGame('evo')
    const view=mount(CommonGamePage,{global:{stubs:{NuxtLink:{template:'<a><slot /></a>'}}}})
    await flushPromises()
    expect(fixture.gateway).toHaveBeenCalledWith('qa',{gameId:'evo',track:undefined,hideEmpty:true},1,25)
    expect(view.text()).toContain('Connettore sperimentale')
    expect(view.find('template').exists()).toBe(false)
    expect(view.get('h2').text()).toBe('Sessioni recenti')
    view.unmount(); useGameContext().selectGame('acc')
  })
  it('loads only selected game with track scope and offers retry on error', async () => {
    useGameContext().selectGame('synthetic',true)
    fixture.gateway.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({sessions:[]})
    const view=mount(CommonGamePage,{props:{surface:'piste',track:'Spa'},global:{stubs:{NuxtLink:{template:'<a><slot /></a>'}}}})
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Impossibile')
    await view.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(fixture.gateway).toHaveBeenLastCalledWith('qa',{gameId:'synthetic',track:'Spa',hideEmpty:true},1,25)
    expect(view.text()).toContain('Nessuna sessione')
    view.unmount(); useGameContext().selectGame('acc')
  })
  it('renders partial and unknown facts with four available sector slots', () => {
    const view=mount(CommonSessionDetail,{props:{session:{schema:'racercore.session',version:1,game_id:'synthetic',session_info:{track:'Spa',car:'Car'},stints:[{laps:[{lap_number:1,completeness:'partial',validity:'unknown',lap_time_ms:null,sector_times_ms:[null,30000,31000,null]}]}]}}})
    expect(view.text()).toContain('Parziale'); expect(view.text()).toContain('Sconosciuta')
    expect(view.findAll('.sector')).toHaveLength(4)
    expect(view.text()).toContain('S1 —'); view.unmount()
  })
  it('discards late history after switching games and pages through the current scope', async () => {
    let finishOld!: (value: unknown) => void
    fixture.gateway.mockReset()
    fixture.gateway.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
      .mockResolvedValueOnce({ sessions: [], state: { currentPage: 1, hasNext: true, hasPrev: false } })
      .mockResolvedValueOnce({ sessions: [], state: { currentPage: 2, hasNext: false, hasPrev: true } })
    useGameContext().selectGame('evo')
    const view = mount(CommonGamePage, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    useGameContext().selectGame('synthetic', true); await flushPromises()
    finishOld({ sessions: [{ sessionId: 'wrong', meta: { track: 'OLD EVO', car: 'car' }, summary: { laps: 9 } }] })
    await flushPromises()
    expect(view.text()).not.toContain('OLD EVO')
    await view.findAll('nav button')[1]!.trigger('click'); await flushPromises()
    expect(fixture.gateway).toHaveBeenLastCalledWith('qa', { gameId: 'synthetic', track: undefined, hideEmpty: true }, 2, 25)
    expect(view.text()).toContain('Pagina 2')
    await view.setProps({ track: 'Spa' }); await flushPromises()
    expect(fixture.gateway).toHaveBeenLastCalledWith('qa', { gameId: 'synthetic', track: 'Spa', hideEmpty: true }, 1, 25)
    view.unmount(); useGameContext().selectGame('acc')
  })
})
