// @vitest-environment jsdom
import { createApp, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'
import SetupFuelPanel from '~/components/overlay/SetupFuelPanel.vue'
let app: ReturnType<typeof createApp> | null = null
const flush = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve(); await nextTick() }
afterEach(() => { app?.unmount(); app=null; document.body.innerHTML=''; vi.restoreAllMocks(); vi.useRealTimers() })
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

const scroll = async(deltaY:number,ctrlKey=false) => {
 const el=document.querySelector('input')!;const event=new WheelEvent('wheel',{deltaY,ctrlKey,bubbles:true,cancelable:true});el.dispatchEvent(event);await flush();return event
}
it('mouse wheel increments and decrements only minutes and prevents page scrolling',async()=>{
 const api=await mount();expect((await scroll(-120)).defaultPrevented).toBe(true);expect(api.trainingOverlayPreviewSetupFuel).toHaveBeenLastCalledWith({mode:'minutes',minutes:11});await scroll(120);expect(api.trainingOverlayPreviewSetupFuel).toHaveBeenLastCalledWith({mode:'minutes',minutes:10});expect((await scroll(0)).defaultPrevented).toBe(false);expect((await scroll(-120,true)).defaultPrevented).toBe(false)
})
it('wheel clamps minutes at1and180',async()=>{
 await mount();const el=document.querySelector('input')!;for(const [value,delta,expected] of [['180',-120,'180'],['1',120,'1']] as const){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));await flush();await scroll(delta);expect(el.value).toBe(expected)}
})
it('pending application freezes wheel and input until completion',async()=>{
 const api=await mount();let done:any;api.trainingOverlayApplySetupFuel.mockImplementation(()=>new Promise(r=>done=r));button('fuel-apply').click();await flush();expect((document.querySelector('input') as HTMLInputElement).disabled).toBe(true);await scroll(-120);expect((document.querySelector('input') as HTMLInputElement).value).toBe('10');done({ok:true,reason:'Completato'});await flush();expect(document.body.textContent).toContain('Completato')
})
it('shows readable blocked state and failed apply inside dedicated status area',async()=>{
 const api=await mount();api.trainingOverlayApplySetupFuel.mockResolvedValue({ok:false,reason:'Apri il menu Pausa'} as any);button('fuel-apply').click();await flush();expect(document.querySelector('[role="status"]')?.textContent).toContain('Apri il menu Pausa');expect(document.body.textContent).toContain('Stint richiesto')
})

it('failed preview disables a previously available action and explains failure',async()=>{
 const api=await mount();expect(button('fuel-apply').disabled).toBe(false);button('fuel').click();await flush();api.trainingOverlayPreviewSetupFuel.mockRejectedValue(Error('offline'));button('fuel').click();await flush();expect(button('fuel-apply').disabled).toBe(true);expect(document.querySelector('[role="status"]')?.textContent).toContain('Anteprima carburante non disponibile')
})

it('keeps the summary and expanded details mounted while minutes recalculate, blocking stale apply',async()=>{
 const api=await mount();const total=document.querySelector('.fuel-total');const details=document.querySelector('details')!;details.open=true
 let done:any;api.trainingOverlayPreviewSetupFuel.mockImplementationOnce(()=>new Promise(r=>done=r))
 button('fuel-plus').click();await flush()
 expect(document.querySelector('.fuel-total')).toBe(total);expect(document.querySelector('details')).toBe(details);expect(details.open).toBe(true)
 expect(button('fuel-apply').disabled).toBe(true);button('fuel-apply').click();expect(api.trainingOverlayApplySetupFuel).not.toHaveBeenCalled()
 done({available:true,sessionType:0,plan:{ok:true,totalLitres:28,contextKey:'session',durationMs:660000,consumption:2.9,referenceLapMs:102000,notes:[]}});await flush()
 expect(document.querySelector('.fuel-total')).toBe(total);expect(total?.textContent).toContain('28');expect(button('fuel-apply').disabled).toBe(false)
 button('fuel-apply').click();await flush();expect(api.trainingOverlayApplySetupFuel).toHaveBeenCalledWith({mode:'minutes',minutes:11,contextKey:'session',totalLitres:28})
})
it('only the latest rapid duration preview can unlock apply',async()=>{
 const api=await mount();let first:any,second:any
 api.trainingOverlayPreviewSetupFuel.mockImplementationOnce(()=>new Promise(r=>first=r)).mockImplementationOnce(()=>new Promise(r=>second=r))
 button('fuel-plus').click();await flush();button('fuel-minus').click();await flush()
 const preview=(totalLitres:number)=>({available:true,sessionType:0,plan:{ok:true,totalLitres,contextKey:'session',durationMs:600000,consumption:2.9,referenceLapMs:102000,notes:[]}})
 first(preview(28));await flush();expect(button('fuel-apply').disabled).toBe(true);expect(document.querySelector('.fuel-total')?.textContent).toContain('25')
 second(preview(26));await flush();expect(button('fuel-apply').disabled).toBe(false);expect(document.querySelector('.fuel-total')?.textContent).toContain('26')
})

it('keeps Apply enabled and wheel selection stable during a slow background refresh', async () => {
 vi.useFakeTimers()
 const api=await mount()
 const rects=vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
 const nav=useOverlayActionSelection(ref(document.body),()=>true)
 nav.select('fuel-apply')
 let resolve:any
 api.trainingOverlayPreviewSetupFuel.mockImplementationOnce(()=>new Promise(r=>resolve=r))
 await vi.advanceTimersByTimeAsync(1500);await flush()
 nav.refresh()
 expect(button('fuel-apply').disabled).toBe(false)
 expect(nav.selectedId.value).toBe('fuel-apply')
 resolve({available:true,sessionType:0,plan:{ok:true,totalLitres:25,contextKey:'session',durationMs:600000,consumption:2.9,referenceLapMs:102000,notes:[]}})
 await flush();nav.refresh()
 expect(nav.selectedId.value).toBe('fuel-apply')
 rects.mockRestore()
})

it('allows apply during background refresh and ignores its late reply', async () => {
 vi.useFakeTimers();const api=await mount();let done:any
 api.trainingOverlayPreviewSetupFuel.mockImplementationOnce(()=>new Promise(r=>done=r))
 await vi.advanceTimersByTimeAsync(1500);await flush()
 button('fuel-apply').click();await flush()
 expect(api.trainingOverlayApplySetupFuel).toHaveBeenCalledTimes(1)
 done({available:false});await flush()
 expect(button('fuel-apply').disabled).toBe(false)
 expect(document.body.textContent).toContain('25 L verificati')
})
