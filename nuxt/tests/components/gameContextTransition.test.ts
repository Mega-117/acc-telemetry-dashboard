// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Transition from '~/components/layout/GameContextTransition.vue'
import Logo from '~/components/layout/GameLogo.vue'
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
it('covers content through loading and reveals only the latest game', async()=>{
 const view=mount(Transition,{props:{gameId:'acc',busy:false},slots:{default:'Data'}})
 expect(view.find('[role=status]').exists()).toBe(false)
 await view.setProps({gameId:'evo',busy:true})
 expect(view.get('.game-context__content').attributes()).toHaveProperty('inert')
 await vi.advanceTimersByTimeAsync(600)
 expect(view.get('[role=status]').text()).toContain('Caricamento · Assetto Corsa EVO')
 await view.setProps({gameId:'acc',busy:false})
 await vi.advanceTimersByTimeAsync(100)
 expect(view.get('[role=status]').text()).toContain('ACC')
 await vi.advanceTimersByTimeAsync(1199)
 expect(view.get('[role=status]').text()).toContain('ACC')
 await vi.advanceTimersByTimeAsync(1)
 expect(view.find('[role=status]').exists()).toBe(false)
 expect(view.get('.game-context__content').classes()).toContain('is-revealing')
 await vi.advanceTimersByTimeAsync(300)
 expect(view.get('.game-context__content').classes()).not.toContain('is-revealing')
 view.unmount()
})
it('cleans pending transitions when unmounted and has a readable unknown game',async()=>{
 const view=mount(Transition,{props:{gameId:'acc',busy:false}})
 await view.setProps({gameId:'synthetic',busy:true})
 expect(view.text()).toContain('Simulatore di test')
 view.unmount()
 expect(vi.getTimerCount()).toBe(0)
})
it('resolves provided logos under the deployment base',()=>{
 vi.stubGlobal('useRuntimeConfig',()=>({app:{baseURL:'/racer/'}}))
 const view=mount(Logo,{props:{gameId:'evo'}})
 expect(view.get('img').attributes('src')).toBe('/racer/images/games/evo.png')
 expect(view.get('img').attributes('alt')).toContain('EVO')
 view.unmount()
})
