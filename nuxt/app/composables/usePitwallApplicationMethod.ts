import { inject, provide, ref, type InjectionKey } from 'vue'
export const MFD_V4_METHOD = 'mfd-v4'
export function createPitwallApplicationMethod() {
  return { method: ref('standard'), v4Drafts: ref<Record<string, Record<string, unknown> | null>>({}) }
}
type State = ReturnType<typeof createPitwallApplicationMethod>
const key: InjectionKey<State> = Symbol('pitwall-application-method')
export function providePitwallApplicationMethod() { const state = createPitwallApplicationMethod(); provide(key, state); return state }
export function usePitwallApplicationMethod() { return inject(key, null) ?? createPitwallApplicationMethod() }
