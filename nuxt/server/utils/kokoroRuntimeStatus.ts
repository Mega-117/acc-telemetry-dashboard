import { managedKokoro } from './managedKokoro'

export async function readKokoroRuntimeStatus() {
  try {
    return await managedKokoro().readStatus()
  } catch (error: any) {
    return { state: 'error' as const, message: error?.message || 'Runtime locale non disponibile' }
  }
}
