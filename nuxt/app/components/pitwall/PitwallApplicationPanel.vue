<script setup lang="ts">
import { computed, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { ACC_DRIVE_METHOD, usePitwallApplicationMethod } from '~/composables/usePitwallApplicationMethod'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
import { canUseDevTools } from '~/utils/devToolsAccess'
const props = defineProps<{ port?: ReturnType<typeof usePitwallRoom> }>()
const { method, draft, initialized } = usePitwallApplicationMethod()
const { isAdmin } = useFirebaseAuth()
const visible = computed(() => canUseDevTools() || isAdmin.value)
const snapshot = computed(() => props.port?.carSnapshot.value)
const capable = computed(() => {
  const methods = snapshot.value?.strategy?.applicationMethods
  return Array.isArray(methods) && methods.includes(ACC_DRIVE_METHOD)
})
const busy = computed(() => props.port?.sending.value || ['pending', 'applying'].includes(props.port?.orderStatus.value ?? ''))
const wheels = ['FL', 'FR', 'RL', 'RR'] as const
const booleanFields = [{ key: 'changeTyre', label: 'Cambio gomme' }, { key: 'changeBodywork', label: 'Riparazione carrozzeria' }, { key: 'changeSuspension', label: 'Riparazione sospensioni' }] as const
watch([method, snapshot], () => {
  if (props.port) props.port.draftSuspended.value = method.value === ACC_DRIVE_METHOD
  if (method.value !== ACC_DRIVE_METHOD || initialized.value) return
  initialized.value = true
  const car = snapshot.value?.strategy
  if (!car) return
  if (typeof car.fuelToAdd === 'number') draft.fuel = car.fuelToAdd
  if (typeof car.tyreSet === 'number') draft.tyreSet = car.tyreSet + 1
  if (car.compound === 'dry' || car.compound === 'wet') draft.compound = car.compound === 'dry' ? 'Dry' : 'Wet'
  const pressures = car.pressures as Record<string, unknown> | undefined
  for (const wheel of wheels) if (typeof pressures?.[wheel] === 'number') draft.pressures[wheel] = pressures[wheel] as number
  draft.driverId = snapshot.value?.crew?.find(driver => driver.current)?.driverIndex ?? null
}, { immediate: true })
const integer = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const complete = computed(() => integer(draft.fuel, 0, 150) && integer(draft.tyreSet, 1, 50)
  && ['Dry', 'Wet'].includes(draft.compound ?? '') && integer(draft.driverId, 0, 255)
  && booleanFields.every(field => typeof draft[field.key] === 'boolean') && !(draft.changeSuspension && !draft.changeBodywork)
  && wheels.every(wheel => typeof draft.pressures[wheel] === 'number' && draft.pressures[wheel]! >= 20.3 && draft.pressures[wheel]! <= 35)
  && integer(draft.mfdKeyCycleSpeed, 1, 5000) && integer(draft.mfdOffset, 0, 20))
const outcome = computed(() => {
  if (props.port?.orderMethod.value !== ACC_DRIVE_METHOD) return null
  const status = props.port.orderStatus.value
  if (status === 'applied') return 'Completed — sequenza ACC Drive completata.'
  if (status === 'pending') return 'Ordine ACC Drive in consegna.'
  if (status === 'applying') {
    const progress = snapshot.value?.strategy?.accDriveProgress as { orderId?: string, sourceStatus?: string } | undefined
    return `${progress?.orderId === props.port.orderId.value ? progress.sourceStatus : 'Started'} — sequenza ACC Drive in esecuzione.`
  }
  return props.port.orderReason.value
})
async function send() {
  if (!complete.value || !capable.value || busy.value || !props.port?.canSend.value) return
  await props.port.sendPlan({ method: ACC_DRIVE_METHOD, accDrive: JSON.parse(JSON.stringify(draft)) })
}
</script>
<template>
  <div v-if="visible" class="application-panel">
    <div class="application-panel__switch" role="group" aria-label="Metodo di applicazione">
      <button type="button" :aria-pressed="method === 'standard'" :disabled="busy" @click="method = 'standard'">Standard</button>
      <button type="button" :aria-pressed="method === ACC_DRIVE_METHOD" :disabled="busy || !capable" @click="method = ACC_DRIVE_METHOD">ACC Drive</button>
    </div>
    <p v-if="!capable" class="application-panel__note">ACC Drive: supporto del PC del pilota non ancora confermato.</p>
    <form v-if="method === ACC_DRIVE_METHOD" @submit.prevent="send">
      <fieldset :disabled="busy">
        <legend>Strategia completa ACC Drive</legend>
        <label>Carburante (L)<input v-model.number="draft.fuel" type="number" min="0" max="150" step="1" required></label>
        <label v-for="field in booleanFields" :key="field.key">{{ field.label }}<select v-model="draft[field.key]" required><option :value="null" disabled>Scegli…</option><option :value="true">Sì</option><option :value="false">No</option></select></label>
        <label>Mescola<select v-model="draft.compound" required><option :value="null" disabled>Scegli…</option><option>Dry</option><option>Wet</option></select></label>
        <label>Set pneumatici<input v-model.number="draft.tyreSet" type="number" min="1" max="50" step="1" required></label>
        <label v-for="wheel in wheels" :key="wheel">Pressione {{ wheel }} (PSI)<input v-model.number="draft.pressures[wheel]" type="number" min="20.3" max="35" step="0.1" required></label>
        <label>Pilota<select v-model="draft.driverId" required><option :value="null" disabled>Scegli…</option><option v-for="driver in snapshot?.crew ?? []" :key="driver.driverIndex" :value="driver.driverIndex">{{ driver.name }}</option></select></label>
        <details><summary>Impostazioni ACC Drive</summary><label>Pausa dopo il tasto (ms)<input v-model.number="draft.mfdKeyCycleSpeed" type="number" min="1" max="5000" required></label><label>Cicli MFD finali<input v-model.number="draft.mfdOffset" type="number" min="0" max="20" required></label></details>
      </fieldset>
      <p v-if="draft.changeTyre === false" class="application-panel__note">Con cambio gomme No la sequenza salta i valori gomme.</p>
      <p v-if="draft.changeSuspension && !draft.changeBodywork">Le sospensioni richiedono anche la carrozzeria.</p>
      <p v-if="outcome" role="status">{{ outcome }}</p>
      <p v-else-if="!complete">Completa i valori e le scelte richieste.</p>
      <button type="submit" :disabled="!complete || !capable || busy || !port?.canSend.value">Invia strategia ACC Drive</button>
    </form>
  </div>
</template>
<style scoped>
.application-panel { padding: 14px; color: #e3e9ee; }
.application-panel__switch { display: flex; gap: 5px; }
button, input, select { border: 1px solid #3b4752; border-radius: 6px; background: #101820; color: inherit; padding: 8px 12px; }
button { cursor: pointer; } button[aria-pressed="true"] { border-color: #ee5b22; background: #472419; }
button:disabled { opacity: .45; cursor: default; }
.application-panel__note { color: #9eaebd; font-size: 12px; }
fieldset { border: 0; margin: 15px 0; padding: 0; display: grid; gap: 10px; }
legend { margin-bottom: 14px; font-weight: 700; }
label { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
input, select { width: 160px; box-sizing: border-box; } details label { margin-top: 10px; }
button[type="submit"] { width: 100%; border-color: #35896e; }
</style>
