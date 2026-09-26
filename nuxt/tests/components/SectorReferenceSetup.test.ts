// @vitest-environment jsdom
import { createApp, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SectorReferenceSetup from '~/components/overlay/SectorReferenceSetup.vue'
const fixture=vi.hoisted(()=>({state:null as any, stop:vi.fn()}))
vi.mock('~/composables/useFastStatePoller',()=>({useFastStatePoller:()=>({fastState:fixture.state,startFastStatePolling:async()=>{},stopFastStatePolling:fixture.stop})}))
let app:ReturnType<typeof createApp>|null=null
const flush=async()=>{for(let i=0;i<6;i++)await nextTick()}
afterEach(()=>{app?.unmount();app=null;document.body.innerHTML='';vi.clearAllMocks()})
async function setup(keyboardOverlay=false){
 fixture.state=ref({isFresh:true,dataSource:'local',context:{track:'Imola',car:'BMW'}})
 const api={hudOverlayGetSettings:vi.fn(async()=>({deltaReference:'bestSector',customSectorReferences:{}})),hudOverlaySaveSettings:vi.fn(async(_id:any,payload:any)=>payload),trainingOverlayKeyboardEditing:vi.fn(async()=>true)}
 ;(window as any).electronAPI=api
 const saved=vi.fn(),cancel=vi.fn(); const el=document.createElement('div');document.body.append(el)
 app=createApp(SectorReferenceSetup,{keyboardOverlay,onSaved:saved,onCancel:cancel});app.mount(el);await flush()
 expect(button('sector-mode-bestSector').getAttribute('aria-pressed')).toBe('true')
 button('sector-mode-custom').click();await flush()
 return {api,saved,cancel,el}
}
async function fill(values=['32,5','27.0','16,8']){document.querySelectorAll('input').forEach((el,i)=>{el.value=values[i]!;el.dispatchEvent(new Event('input',{bubbles:true}))});await flush()}
function button(id:string){return document.querySelector(`[data-overlay-wheel-action="${id}"]`) as HTMLButtonElement}
describe('sector reference editor',()=>{
 it('types decimal values and atomically saves all three for the bound context',async()=>{
  const {api,saved}=await setup();expect(button('sector-save').disabled).toBe(true)
  await fill();button('sector-save').click();await flush()
  expect(api.hudOverlaySaveSettings).toHaveBeenCalledWith('sectors',{deltaReference:'custom',customSectorReference:{track:'Imola',car:'BMW',timesMs:[32500,27000,16800]}})
  expect(saved).toHaveBeenCalledTimes(1)
 })
 it('blocks invalid limits, incomplete input and context changes',async()=>{
  const {api}=await setup();await fill(['9.9','27.0','16.8']);expect(button('sector-save').disabled).toBe(true)
  await fill(['10.0','70.0','16.8']);expect(button('sector-save').disabled).toBe(false)
  fixture.state.value.context.track='Spa';await flush();expect(button('sector-save').disabled).toBe(true)
  button('sector-save').click();expect(api.hudOverlaySaveSettings).not.toHaveBeenCalled()
 })
 it('cancels without saving and switches back to best without requiring custom values',async()=>{
  const {api,cancel}=await setup();button('sector-cancel').click();expect(cancel).toHaveBeenCalledTimes(1);expect(api.hudOverlaySaveSettings).not.toHaveBeenCalled()
  button('sector-mode-bestSector').click();await flush();button('sector-save').click();await flush()
  expect(api.hudOverlaySaveSettings).toHaveBeenCalledWith('sectors',{deltaReference:'bestSector'})
 })
 it('supports controller action buttons, explicit typing focus and cleanup',async()=>{
  const {api}=await setup(true);expect(api.trainingOverlayKeyboardEditing).not.toHaveBeenCalled()
  button('sector-0-plus-1').click();await flush();expect((document.querySelector('input') as HTMLInputElement).value).toBe('10,0')
  document.querySelector('input')!.dispatchEvent(new Event('pointerdown',{bubbles:true,cancelable:true}));await flush()
  expect(api.trainingOverlayKeyboardEditing).toHaveBeenCalledWith(true)
  app!.unmount();app=null;expect(api.trainingOverlayKeyboardEditing).toHaveBeenLastCalledWith(false);expect(fixture.stop).toHaveBeenCalled()
 })
 it('keeps the editor open and retryable when persistence fails',async()=>{
  const {api,saved}=await setup();api.hudOverlaySaveSettings.mockRejectedValueOnce(new Error('Disco non disponibile'))
  await fill();button('sector-save').click();await flush();expect(saved).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Disco non disponibile');expect(button('sector-save').disabled).toBe(false)
 })
})

it('does not claim keyboard focus when IPC denies it',async()=>{
 const {api}=await setup(true);api.trainingOverlayKeyboardEditing.mockResolvedValue(false)
 document.querySelector('input')!.dispatchEvent(new Event('pointerdown',{bubbles:true,cancelable:true}));await flush()
 expect(document.body.textContent).toContain('Tastiera non disponibile')
})
it('restores existing times and ignores late settings after unmount',async()=>{
 const {api}=await setup();app!.unmount();app=null
 api.hudOverlayGetSettings.mockResolvedValue({deltaReference:'custom',customSectorReferences:{'["imola","bmw"]':[32500,27000,16800]}} as any)
 const el=document.createElement('div');document.body.append(el);app=createApp(SectorReferenceSetup);app.mount(el);await flush()
 expect([...el.querySelectorAll('input')].map(el=>el.value)).toEqual(['32,5','27,0','16,8'])
})
