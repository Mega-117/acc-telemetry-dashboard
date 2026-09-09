import { inject, provide, reactive, ref, type InjectionKey } from 'vue'
export const MFD_V3_METHOD = 'mfd-v3'
export function createPitwallApplicationMethod() {
  return { method: ref('standard'), initialized: ref(false), draft: reactive({
    fuelLiters: null as number | null, changeTyres: null as boolean | null,
    compound: null as 'dry' | 'wet' | null, tyreSet: null as number | null,
    pressures: { FL: null, FR: null, RL: null, RR: null } as Record<'FL' | 'FR' | 'RL' | 'RR', number | null>,
    driverId: null as number | null, repairBodywork: null as boolean | null, repairSuspension: null as boolean | null,
    brakes: null as boolean | null, brakeFront: null as number | null, brakeRear: null as number | null, pitStrategy: 1,
  }) }
}
type State = ReturnType<typeof createPitwallApplicationMethod>
const key: InjectionKey<State> = Symbol('pitwall-application-method')
export function providePitwallApplicationMethod() { const state = createPitwallApplicationMethod(); provide(key, state); return state }
export function usePitwallApplicationMethod() { return inject(key, null) ?? createPitwallApplicationMethod() }
