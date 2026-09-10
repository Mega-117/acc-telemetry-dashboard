import { createApp, computed, ref } from 'vue'
import PitStop from '../../../app/components/pitwall/concept/PitwallConceptPitStop.vue'
import MyRoom from '../../../app/components/pitwall/concept/PitwallConceptMyRoom.vue'
import Wall from '../../../app/components/pitwall/concept/PitwallConceptWall.vue'
import { providePitwallStore } from '../../../app/composables/usePitwallStore'
import { usePitwallController } from '../../../app/composables/usePitwallController'

// Synthetic boundary only: the production component and controller run without
// Firebase, accounts, input IPC or any connection to the user's runtime.
createApp({ components: { PitStop, MyRoom, Wall }, setup() {
  const currentRoom = ref<any>({ id: 'qa-room', label: 'Pitwall di A', track: null, carNumber: null, state: 'live', drivingId: null,
    members: Array.from({ length: 16 }, (_, index) => ({ personId: index === 0 ? 'A' : String(index), role: 'member', driving: false, online: true })), invitedIds: [] })
  const partyRace = computed(() => currentRoom.value && ({ ...currentRoom.value, membershipModel: 'social', hostId: 'A', carNumber: 0,
    carModel: '', track: '', session: '', closed: false, reason: { kind: 'grant', personId: 'A' } }))
  const intent = { available: true, state: 'off', roomId: null, reason: null }
  const target = ref<string | null>(null)
  const available = ref([{ uid: 'A', nickname: 'Pilota A — gara' }, { uid: 'C', nickname: 'Pilota C — allenamento' }])
  const now = Date.now()
  const link: any = {
    nowTick: ref(now), room: ref({ roomId: 'qa-room', track: 'Monza', closedAt: null }),
    selectedRoomId: ref('qa-room'), selectedTargetUid: target, availableTargets: available,
    roomClosed: ref(false), amMember: ref(true), crew: ref([]), orderFields: ref({}),
    orderStatus: ref(null), orderReason: ref(null), orderMethod: ref('standard'),
    executor: computed(() => ({ executor: available.value.some(x => x.uid === target.value) ? { uid: target.value } : null, reason: target.value ? 'ready' : 'none', conflicting: [] })),
    executorLabel: computed(() => target.value || 'Seleziona un pilota'),
    carSnapshot: computed(() => available.value.some(x => x.uid === target.value) ? { protocolVersion: 3, connected: true, updatedAtMs: now,
      nickname: target.value, crew: [], strategy: { fuelToAdd: target.value === 'A' ? 10 : 3, tyreSet: 2, compound: 'dry', pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } } } : null),
    canSend: computed(() => available.value.some(x => x.uid === target.value)),
    sendReadiness: computed(() => ({ ready: available.value.some(x => x.uid === target.value), reason: 'Pilota non disponibile.' })),
    selectTarget: (value: string | null) => { target.value = value },
    sendPlan: async () => { link.orderStatus.value = 'partial'; link.orderReason.value = 'QA: pressione non confermata'; return true },
  }
  const controller = usePitwallController(link, { pendingIncoming: ref([]), grantedIncoming: ref([]) } as any)
  providePitwallStore({ stop: { ...controller, application: link, orderStatus: link.orderStatus, orderReason: link.orderReason,
    hasCarSnapshot: computed(() => !!link.carSnapshot.value), lastOrder: controller.sentPlan } } as any)
  return { target, fuel: controller.fuelLiters, currentRoom, partyRace, intent, leave: () => { currentRoom.value = null },
    recoverConnection: () => { if (currentRoom.value) currentRoom.value.members[0].reconnecting = !currentRoom.value.members[0].reconnecting },
    disconnect: () => { available.value = available.value.filter(x => x.uid !== 'A') },
    restore: () => { available.value = [{ uid: 'A', nickname: 'Pilota A — gara' }, { uid: 'C', nickname: 'Pilota C — allenamento' }] },
  }
}, template: `<main><h1>Pitwall — QA isolata PIP390</h1><p>Party sociale: creatore A, 16 partecipanti · dati sintetici</p><button @click="recoverConnection">Simula/ripristina riconnessione A</button><MyRoom :room="currentRoom" :pitwall="intent" :people="[{id:'A',handle:'@A'}]" me-id="A" @close="leave" /><Wall v-if="partyRace" :race="partyRace" :people="[{id:'A',handle:'@A'}]" me-id="A" @leave="leave" /><nav><button @click="disconnect">Simula A indisponibile</button><button @click="restore">Ripristina A</button></nav><p>Destinatario: {{ target || 'nessuno' }} · Bozza carburante: {{ fuel }}</p><PitStop /></main>` }).mount('#app')
const style = document.createElement('style')
style.textContent = 'body{margin:0;background:#111821;color:#eaf0f6;font:15px system-ui}main{max-width:1100px;margin:auto;padding:24px}button,select,input{font:inherit}button{cursor:pointer}nav{display:flex;gap:12px}h1{font-size:24px}'
document.head.append(style)
