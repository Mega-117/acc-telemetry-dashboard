// @vitest-environment jsdom
import { createApp, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SectorReferenceSetup from '~/components/overlay/SectorReferenceSetup.vue'
const fixture=vi.hoisted(()=>({state:null as any, stop:vi.fn()}))
vi.mock('~/composables/useFastStatePoller',()=>({useFastStatePoller:()=>({fastState:fixture.state,startFastStatePolling:async()=>{},stopFastStatePolling:fixture.stop})}))
let app:ReturnType<typeof createApp>|null=null
const flush=async()=>{for(let i=0;i<6;i++)await nextTick()}
afterEach(()=>{app?.unmount();app=null;document.body.innerHTML='';vi.clearAllMocks()})
async function setup(keyboardOverlay=false, initial: Record<string, unknown> = {}){
 fixture.state=ref({isFresh:true,dataSource:'local',context:{track:'Imola',car:'BMW'}, ...initial})
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
 it('edits all declared sectors and blocks saving after a variant switch',async()=>{
  const {api}=await setup(false,{context:{gameId:'qa-orbit-v1',track:'Spa',car:'BMW',variant:'reverse'},sectorHud:{sectors:[{},{},{},{}]}})
  expect(document.querySelectorAll('input')).toHaveLength(4)
  await fill(['10.0','20.0','30.0','40.0']);button('sector-save').click();await flush()
  expect(api.hudOverlaySaveSettings).toHaveBeenCalledWith('sectors',{deltaReference:'custom',customSectorReference:{gameId:'qa-orbit-v1',track:'Spa',car:'BMW',variant:'reverse',sectorCount:4,timesMs:[10000,20000,30000,40000]}})
  fixture.state.value.context.variant='forward';await flush()
  expect(button('sector-save').disabled).toBe(true)
 })
 it('types decimal values and atomically saves all three for the bound context',async()=>{
  const {api,saved}=await setup();expect(button('sector-save').disabled).toBe(true)
  await fill();button('sector-save').click();await flush()
  expect(api.hudOverlaySaveSettings).toHaveBeenCalledWith('sectors',{deltaReference:'custom',customSectorReference:{track:'Imola',car:'BMW',sectorCount:3,timesMs:[32500,27000,16800]}})
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
 // PIP-556: in Ctrl+K each sector has independent SEC and DEC fields, pre-filled
 // from the best sectors, edited with OK + Up/Down and left with OK or Back.
 it('starts from the best sectors and edits one sector field from the wheel',async()=>{
  const sectorHud={sectors:[{bestMs:31_249},{bestMs:42_050},{bestMs:30_970}]}
  const {api}=await setup(true,{sectorHud})
  expect([...document.querySelectorAll('.sector-reference-value')].map(el=>el.textContent)).toEqual(['31',',2','42',',1','31',',0'])
  expect(document.querySelector('input')).toBeNull()
  const editor=(app as any)._instance.exposed as {handleWheelCommand(command:string):boolean}
  expect(editor.handleWheelCommand('next-action')).toBe(false)
  button('sector-1-tenths').click();await flush()
  expect(editor.handleWheelCommand('next-action')).toBe(true);expect(editor.handleWheelCommand('next-action')).toBe(true)
  expect(editor.handleWheelCommand('previous-action')).toBe(true)
  expect(editor.handleWheelCommand('back')).toBe(true);await flush()
  expect(editor.handleWheelCommand('next-action')).toBe(false)
  button('sector-save').click();await flush()
  expect(api.hudOverlaySaveSettings).toHaveBeenCalledWith('sectors',expect.objectContaining({customSectorReference:expect.objectContaining({timesMs:[31200,42200,31000]})}))
  app!.unmount();app=null;expect(fixture.stop).toHaveBeenCalled()
 })
 it('keeps the editor open and retryable when persistence fails',async()=>{
  const {api,saved}=await setup();api.hudOverlaySaveSettings.mockRejectedValueOnce(new Error('Disco non disponibile'))
  await fill();button('sector-save').click();await flush();expect(saved).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Disco non disponibile');expect(button('sector-save').disabled).toBe(false)
 })
})

it('offers the best sectors again after manual changes',async()=>{
 await setup(true,{sectorHud:{sectors:[{bestMs:31_000},{bestMs:42_000},{bestMs:31_000}]}})
 button('sector-0-tenths').click();await flush()
 const editor=(app as any)._instance.exposed as {handleWheelCommand(command:string):boolean}
 editor.handleWheelCommand('next-action');editor.handleWheelCommand('back');await flush()
 expect(button('sector-0-tenths').textContent).toBe(',1')
 button('sector-use-best').click();await flush()
 expect(button('sector-0-tenths').textContent).toBe(',0')
})
it('changes seconds without touching the tenths, up to 4:00 per sector',async()=>{
 await setup(true,{sectorHud:{sectors:[{bestMs:159_900},{bestMs:42_000},{bestMs:31_000}]}})
 button('sector-0-seconds').click();await flush()
 const editor=(app as any)._instance.exposed as {handleWheelCommand(command:string):boolean}
 editor.handleWheelCommand('next-action');await flush()
 expect([button('sector-0-seconds').textContent,button('sector-0-tenths').textContent]).toEqual(['160',',9'])
})
it('restores existing times and ignores late settings after unmount',async()=>{
 const {api}=await setup();app!.unmount();app=null
 api.hudOverlayGetSettings.mockResolvedValue({deltaReference:'custom',customSectorReferences:{'["imola","bmw"]':[32500,27000,16800]}} as any)
 const el=document.createElement('div');document.body.append(el);app=createApp(SectorReferenceSetup);app.mount(el);await flush()
 expect([...el.querySelectorAll('input')].map(el=>el.value)).toEqual(['32,5','27,0','16,8'])
})
