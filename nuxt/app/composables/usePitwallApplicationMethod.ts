import { inject, provide, reactive, ref, type InjectionKey } from 'vue'
export const ACC_DRIVE_METHOD = 'acc-drive-7.8.1'
export function createPitwallApplicationMethod() {
  return { method: ref('standard'), initialized: ref(false), draft: reactive({
    fuel: null as number | null, changeTyre: null as boolean | null,
    compound: null as 'Dry' | 'Wet' | null, tyreSet: null as number | null,
    pressures: { FL: null, FR: null, RL: null, RR: null } as Record<'FL' | 'FR' | 'RL' | 'RR', number | null>,
    driverId: null as number | null, changeBodywork: null as boolean | null, changeSuspension: null as boolean | null,
    mfdKeyCycleSpeed: 60, mfdOffset: 0,
  }) }
}
type State = ReturnType<typeof createPitwallApplicationMethod>
const key: InjectionKey<State> = Symbol('pitwall-application-method')
export function providePitwallApplicationMethod() { const state = createPitwallApplicationMethod(); provide(key, state); return state }
export function usePitwallApplicationMethod() { return inject(key, null) ?? createPitwallApplicationMethod() }
