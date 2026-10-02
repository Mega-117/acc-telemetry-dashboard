// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import CommonSessionDetail from '~/components/sessions/CommonSessionDetail.vue'
import GameSelector from '~/components/layout/GameSelector.vue'
import CommonGamePage from '~/components/pages/CommonGamePage.vue'
import { useGameContext } from '~/composables/useGameContext'
const fixture = vi.hoisted(() => ({ gateway: vi.fn(), live: null as any, admin: null as any }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => ({ getSessionsPage: fixture.gateway }) }))
vi.mock('~/composables/usePilotContext', () => ({ usePilotContext: () => ref('qa') }))
vi.mock('~/composables/useDevToolsAccess', () => ({ useDevToolsAccess: () => ({ canAccessDevTools: fixture.admin }) }))
vi.mock('~/composables/useFastStatePoller', () => ({ useFastStatePoller: () => ({ fastState: fixture.live, startFastStatePolling: vi.fn(), stopFastStatePolling: vi.fn() }) }))
describe('common game surfaces', () => {
  it('changes consulted game only by user selection and hides synthetic for ordinary accounts', async () => {
    useGameContext().selectGame('acc')
    fixture.admin=ref(false); fixture.live=ref({commonLive:null})
    const view=mount(GameSelector)
    expect(view.find('option[value="synthetic"]').exists()).toBe(false)
    await view.get('select').setValue('evo')
    fixture.live.value={commonLive:{connected:true,gameId:'acc'}}
    await flushPromises()
    expect((view.get('select').element as HTMLSelectElement).value).toBe('evo')
    expect(view.text()).toContain('Connesso: ACC')
    fixture.admin.value=true; await flushPromises()
    await view.get('select').setValue('synthetic')
    expect(useGameContext().consultedGame.value).toBe('synthetic')
    view.unmount(); useGameContext().selectGame('acc')
  })
  it('shows unsupported EVO without loading another game history', async () => {
    fixture.gateway.mockClear(); useGameContext().selectGame('evo')
    const view=mount(CommonGamePage,{global:{stubs:{NuxtLink:{template:'<a><slot /></a>'}}}})
    await flushPromises()
    expect(fixture.gateway).not.toHaveBeenCalled()
    expect(view.text()).toContain('non è ancora disponibile')
    view.unmount(); useGameContext().selectGame('acc')
  })
  it('loads only selected game with track scope and offers retry on error', async () => {
    useGameContext().selectGame('synthetic',true)
    fixture.gateway.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({sessions:[]})
    const view=mount(CommonGamePage,{props:{surface:'piste',track:'Spa'},global:{stubs:{NuxtLink:{template:'<a><slot /></a>'}}}})
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Impossibile')
    await view.get('button').trigger('click'); await flushPromises()
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
})
