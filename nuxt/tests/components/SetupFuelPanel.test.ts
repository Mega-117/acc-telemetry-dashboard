// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SetupFuelPanel from '~/components/overlay/SetupFuelPanel.vue'
let app: ReturnType<typeof createApp> | null = null
const flush = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve(); await nextTick() }
afterEach(() => { app?.unmount(); app=null; document.body.innerHTML=''; vi.restoreAllMocks() })
async function mount(available=true,sessionType=0) {
 const api={trainingOverlayPreviewSetupFuel:vi.fn(async()=>({available,sessionType,plan:{ok:true,totalLitres:25,contextKey:'session',durationMs:600000,consumption:2.9,referenceLapMs:102000,notes:[]}})),trainingOverlayApplySetupFuel:vi.fn(async()=>({ok:true,reason:'25 L verificati'})),trainingOverlayKeyboardEditing:vi.fn(async()=>true)}
 const el=document.createElement('div');document.body.append(el);app=createApp(SetupFuelPanel,{api});app.mount(el)
 ;(document.querySelector('[data-overlay-wheel-action="fuel"]') as HTMLButtonElement).click();await flush();return api
}
const button=(id:string)=>document.querySelector(`[data-overlay-wheel-action="${id}"]`) as HTMLButtonElement
describe('Fuel from Ctrl+K',()=>{
 it('qualifying and race start with automatic session duration',async()=>{const api=await mount(true,1);await flush();expect(api.trainingOverlayPreviewSetupFuel).toHaveBeenLastCalledWith({mode:'auto',minutes:10})})
 it('shows total and sends current preview identity with one apply',async()=>{const api=await mount();expect(button('fuel-apply').textContent).toContain('25 L');button('fuel-apply').click();await flush();expect(api.trainingOverlayApplySetupFuel).toHaveBeenCalledWith({mode:'minutes',minutes:10,contextKey:'session',totalLitres:25});expect(document.body.textContent).toContain('25 L verificati')})
 it('blocks apply outside safe pit context',async()=>{const api=await mount(false);expect(button('fuel-apply').disabled).toBe(true);button('fuel-apply').click();expect(api.trainingOverlayApplySetupFuel).not.toHaveBeenCalled()})
 it('wheel buttons change minutes and auto selects session duration',async()=>{const api=await mount();button('fuel-plus').click();await flush();expect(api.trainingOverlayPreviewSetupFuel).toHaveBeenLastCalledWith({mode:'minutes',minutes:11});button('fuel-auto').click();await flush();expect(api.trainingOverlayPreviewSetupFuel).toHaveBeenLastCalledWith({mode:'auto',minutes:11})})
})
