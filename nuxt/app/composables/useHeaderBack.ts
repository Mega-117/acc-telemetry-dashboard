import { inject, onBeforeUnmount, onMounted, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'

interface HeaderBackAction {
  label: () => string
  run: () => unknown
}

const headerBackKey: InjectionKey<ShallowRef<HeaderBackAction | null>> = Symbol('header-back')

export function provideHeaderBack() {
  const action = shallowRef<HeaderBackAction | null>(null)
  provide(headerBackKey, action)
  return action
}

export function useHeaderBack(run: () => unknown, label: () => string) {
  const header = inject(headerBackKey, null)
  const action: HeaderBackAction = { run, label }
  onMounted(() => { if (header) header.value = action })
  // A leaving page must not clear the action of the page entering after it.
  onBeforeUnmount(() => { if (header?.value === action) header.value = null })
  return Boolean(header)
}
