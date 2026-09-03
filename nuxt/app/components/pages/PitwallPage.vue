<script setup lang="ts">
// La pagina del muretto, dal punto di vista di chi ci sta seduto.
//
// Non si assiste piu' una *persona*: si entra nella gara di una vettura. E' la
// differenza che regge l'endurance - i piloti si alternano, chi non guida
// spegne il PC, e l'ingegnere non deve rifare niente quando cambia il volante.
//
// Tre cose devono restare vere a schermo, sempre:
//  - si vede chi c'e' e chi sta guidando *adesso*, senza doverlo chiedere;
//  - il bottone Invia e' spento quando l'ordine non potrebbe partire, e la
//    pagina dice perche' invece di accettarlo e farlo scadere in silenzio;
//  - `READY` significa applicata e riletta, mai inviata.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { usePitwallRoom } from '~/composables/usePitwallRoom'
import { usePitwallLink } from '~/composables/usePitwallLink'
import { usePitwallController } from '~/composables/usePitwallController'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import PitwallCarCard from '~/components/pitwall/PitwallCarCard.vue'
import PitwallOrderBar from '~/components/pitwall/PitwallOrderBar.vue'
import PitwallValueField from '~/components/pitwall/PitwallValueField.vue'
import PitwallToggleField from '~/components/pitwall/PitwallToggleField.vue'
import {
  PITWALL_FUEL_MAX_L,
  PITWALL_FUEL_MIN_L,
  PITWALL_PRESSURE_MAX_PSI,
  PITWALL_PRESSURE_MIN_PSI,
  PITWALL_TYRE_SET_MAX,
  PITWALL_TYRE_SET_MIN,
  PITWALL_WHEELS,
  clampFuel,
  clampTyreSet,
  stepFuel,
  stepTyreSet,
  wheelLabel,
} from '~/utils/pitwallPresentation'

const { currentUser } = useFirebaseAuth()
// La gara: chi c'e', chi guida, dove va l'ordine.
const link = usePitwallRoom({ uid: () => currentUser.value?.uid ?? null })
// I permessi fra account restano il mattoncino della fiducia: chi mi ha
// autorizzato una volta si ritrova invitato alle gare senza richiederlo, e da
// qui si concede o si toglie. Non e' un secondo canale per gli ordini.
const trust = usePitwallLink({ engineerUid: () => currentUser.value?.uid ?? null })

// La logica dell'ordine - base fresca, payload sparso, motivo del blocco,
// esito per campo - vive in un posto solo e la usano entrambe le viste.
const {
  session,
  presenceAgeSeconds,
  carFresh,
  drivers,
  pressures,
  fuelLiters,
  compound,
  tyreSet,
  changeTyres,
  driverId,
  pitStrategy,
  brakes,
  repairBodywork,
  repairSuspension,
  car,
  echo,
  changeChips,
  orderStatus,
  stopEstimate,
  mfdPlan,
  compoundOptions,
  driverOptions,
  adjustPressure,
  setPressure,
  stepPitStrategy,
  onCompoundChange,
  resetToCar,
  hasChanges,
  sendEnabled,
  pendingRequests,
  trustedEngineers,
  requesterName,
  blockedReason,
  sendToCar,
  fieldOutcomes,
  scopeLabel,
  roomStateLabel,
} = usePitwallController(link, trust)

const nowTick = computed(() => link.nowTick.value)

onMounted(() => {
  link.start()
  void trust.refreshIncoming()
  trust.watchLive()
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
  link.stop()
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void trust.search() }, 350)
}
</script>

<template>
  <div class="pitwall-page">
    <main class="pitwall">
      <section v-if="pendingRequests.length" class="invite" aria-live="polite">
        <div v-for="request in pendingRequests" :key="request.engineerUid" class="invite__row">
          <p><strong>{{ requesterName(request) }}</strong> vuole entrare nelle tue gare come ingegnere di pista.</p>
          <button type="button" class="btn btn--primary" @click="trust.decide(request.engineerUid, 'granted', 'once')">Autorizza per oggi</button>
          <button type="button" class="btn" @click="trust.decide(request.engineerUid, 'granted', 'always')">Autorizza sempre</button>
          <button type="button" class="btn btn--ghost" @click="trust.decide(request.engineerUid, 'revoked')">Rifiuta</button>
        </div>
      </section>

      <h1 class="page-title">GARA</h1>
      <section class="connections" aria-label="Gara ed equipaggio">
        <article class="connection-cell connection-cell--active">
          <h2 class="eyebrow eyebrow--green">GARA IN CORSO</h2>
          <template v-if="link.room.value">
            <div class="active-pilot__name-row">
              <strong>{{ link.room.value.label }}</strong>
              <span class="status-pill" :class="link.executor.value.reason === 'ready' ? 'is-online' : 'is-offline'">
                {{ roomStateLabel }}
              </span>
            </div>
            <p class="active-pilot__meta">
              <span class="check">✓</span>{{ link.executorLabel.value }}
            </p>
            <p class="active-pilot__meta">
              <span class="clock">◷</span>{{ presenceAgeSeconds == null ? 'In attesa dei dati macchina' : `Dati macchina aggiornati ${presenceAgeSeconds}s fa` }}
            </p>
            <div class="room-actions">
              <label v-if="link.rooms.value.length > 1" class="select-control select-control--room">
                <span>Cambia gara</span>
                <select :value="link.selectedRoomId.value" @change="link.selectRoom(($event.target as HTMLSelectElement).value)">
                  <option v-for="entry in link.rooms.value" :key="entry.roomId" :value="entry.roomId">{{ entry.label }}</option>
                </select>
              </label>
              <button v-if="link.isManager.value && !link.roomClosed.value" type="button" class="btn btn--ghost" @click="link.closeRoom()">Chiudi gara</button>
              <button v-if="link.amMember.value && link.room.value.hostUid !== currentUser?.uid" type="button" class="btn btn--ghost" @click="link.leave()">Esci</button>
            </div>
          </template>
          <template v-else>
            <strong class="active-pilot__empty-title">Nessuna gara</strong>
            <p class="cell-note">
              La gara compare da sola quando qualcuno dell’equipaggio è in sessione su ACC: non c’è nessun
              codice da girarsi. Se non compare, chiedi a un membro di invitarti.
            </p>
          </template>
          <p v-if="link.lastError.value" class="cell-error">{{ link.lastError.value }}</p>
          <p v-if="link.notice.value" class="cell-notice">{{ link.notice.value }}</p>
        </article>

        <article class="connection-cell connection-cell--search">
          <h2 class="eyebrow eyebrow--blue">AGGIUNGI ALLA GARA</h2>
          <input v-model="trust.searchTerm.value" class="search-input" type="search" placeholder="Cerca una persona per nome…" aria-label="Cerca una persona per nome" @input="onSearchInput">
          <p class="cell-note">
            <template v-if="link.isManager.value">Invitala a questa gara, oppure autorizzala una volta per tutte: chi ti ha già autorizzato si ritrova invitato da solo alle prossime gare.</template>
            <template v-else>Solo chi gestisce la gara può invitare. Puoi comunque autorizzare qualcuno ad assisterti nelle tue gare.</template>
          </p>
          <p v-if="trust.notice.value" class="cell-notice">{{ trust.notice.value }}</p>
          <ul v-if="trust.searchResults.value.length" class="search-results">
            <li v-for="found in trust.searchResults.value" :key="found.uid">
              <strong>{{ found.nickname }}</strong>
              <button v-if="link.isManager.value && link.room.value" type="button" class="btn btn--primary" @click="link.invite(found.uid)">Invita alla gara</button>
              <button type="button" class="btn btn--ghost" @click="trust.preAuthorise(found.uid, 'once')">Autorizza per oggi</button>
              <button type="button" class="btn btn--ghost" @click="trust.preAuthorise(found.uid)">Autorizza sempre</button>
            </li>
          </ul>
        </article>

        <article class="connection-cell connection-cell--recent">
          <h2 class="eyebrow eyebrow--purple">EQUIPAGGIO</h2>
          <div class="recent-list">
            <div v-for="person in link.crew.value" :key="person.uid" class="recent-row">
              <span
                class="presence-dot"
                :class="person.driving ? 'is-driving' : person.online ? 'is-online' : (person.invited || person.connecting) ? 'is-waiting' : ''"
              />
              <strong>{{ person.nickname }}{{ person.isSelf ? ' (tu)' : '' }}</strong>
              <span class="grant-pill" :class="{ 'is-permanent': person.driving }">
                <template v-if="person.driving">AL VOLANTE</template>
                <template v-else-if="person.invited">invitato · non ancora entrato</template>
                <template v-else-if="person.connecting">in collegamento…</template>
                <template v-else-if="person.online">{{ person.role === 'manager' ? 'gestisce la gara' : 'presente' }}</template>
                <template v-else>{{ person.role === 'manager' ? 'gestisce la gara · offline' : 'offline' }}</template>
              </span>
              <div class="recent-row__actions">
                <button
                  v-if="link.isManager.value && !person.isSelf && !person.invited && person.role !== 'manager'"
                  type="button" class="btn btn--ghost" @click="link.promote(person.uid)"
                >Promuovi</button>
                <button
                  v-if="link.isManager.value && !person.isSelf && link.room.value?.hostUid !== person.uid"
                  type="button" class="btn btn--ghost" @click="link.revoke(person.uid)"
                >Togli</button>
              </div>
            </div>
            <div v-for="request in trustedEngineers" :key="`trusted-${request.engineerUid}`" class="recent-row recent-row--incoming">
              <span class="presence-dot is-incoming" />
              <strong>{{ requesterName(request) }}</strong>
              <span class="grant-pill">PUÒ ASSISTERTI · {{ scopeLabel(request) }}</span>
              <div class="recent-row__actions">
                <button type="button" class="btn btn--ghost" @click="trust.decide(request.engineerUid, 'revoked')">Revoca</button>
              </div>
            </div>
            <p v-if="!link.crew.value.length && !trustedEngineers.length" class="cell-note">Nessun equipaggio: la gara comparirà da sola quando qualcuno è in pista.</p>
          </div>
          <p v-if="link.executor.value.reason === 'multiple-driving'" class="cell-error">
            Due piloti risultano al volante: nessun ordine parte finché non è chiaro chi guida.
          </p>
        </article>
      </section>
      <div class="workspace">
        <section class="strategy" aria-labelledby="strategy-title">
          <h2 id="strategy-title" class="panel-title">STRATEGIA DA INVIARE</h2>
          <div class="strategy__body">
            <div class="strategy-topline">
              <div class="static-control" title="Sceglie il preset di strategia dell'assetto. Attenzione: riscrive carburante, set e pressioni con i valori del preset.">
                <span>Preset strategia</span>
                <div class="static-stepper">
                  <button type="button" aria-label="Strategia precedente" @click="stepPitStrategy(-1)">−</button>
                  <strong>{{ pitStrategy == null ? 'Off' : pitStrategy }}</strong>
                  <button type="button" aria-label="Strategia successiva" @click="stepPitStrategy(1)">+</button>
                </div>
              </div>
              <PitwallValueField title="Carburante in uscita" input-label="Carburante in uscita in litri" size="sm" bare unit="L" :value="fuelLiters" :min="PITWALL_FUEL_MIN_L" :max="PITWALL_FUEL_MAX_L" :echo="echo.fuel" @step="fuelLiters = stepFuel(fuelLiters, $event)" @update:value="fuelLiters = clampFuel($event)" />
            </div>

            <section class="tyres-card" aria-labelledby="tyres-title">
              <h3 id="tyres-title">Pressioni pneumatici (PSI)</h3>
              <div class="tyres-layout">
                <div class="pressure-map">
                  <PitwallValueField v-for="wheel in PITWALL_WHEELS" :key="wheel" :class="`tyre-control tyre-control--${wheel.toLowerCase()}`" :title="wheel" :input-label="`Pressione ${wheelLabel(wheel)} in PSI`" :value="pressures[wheel]" :min="PITWALL_PRESSURE_MIN_PSI" :max="PITWALL_PRESSURE_MAX_PSI" :step="0.1" :decimals="1" bare :echo="echo[wheel]" @step="adjustPressure(wheel, $event)" @update:value="setPressure(wheel, $event)" />
                  <img class="car-silhouette" src="/images/pitwall-car-top.svg?v=6" alt="Sagoma della vettura vista dall’alto">
                </div>
                <div class="tyre-settings">
                  <PitwallValueField title="Set pneumatici" size="sm" input-label="Numero set pneumatici" :value="tyreSet" :min="PITWALL_TYRE_SET_MIN" :max="PITWALL_TYRE_SET_MAX" bare :echo="echo.tyreSet" @step="tyreSet = stepTyreSet(tyreSet, $event)" @update:value="tyreSet = clampTyreSet($event)" />
                  <label class="select-control"><span>Mescola</span><select :value="compound" @change="onCompoundChange"><option v-for="option in compoundOptions" :key="option.value" :value="option.value">{{ option.value === 'dry' ? 'Dry' : option.label }}</option></select></label>
                  <PitwallToggleField v-model="changeTyres" label="Cambio gomme" />
                </div>
              </div>
            </section>

            <section class="pit-services" aria-label="Servizi al pit stop">
              <div class="service-row">
                <label class="select-control select-control--driver"><span>Prossimo pilota</span><select v-model="driverId"><option v-for="option in driverOptions" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select></label>
              </div>
              <fieldset class="repairs">
                <legend>Servizi e riparazioni</legend>
                <PitwallToggleField v-model="brakes" label="Sostituisci freni" />
                <PitwallToggleField v-model="repairSuspension" label="Sospensioni" />
                <PitwallToggleField v-model="repairBodywork" label="Carrozzeria" />
              </fieldset>
            </section>
          </div>
          <PitwallOrderBar :status="orderStatus" :chips="changeChips" :stop="stopEstimate" :can-send="sendEnabled" :blocked-reason="blockedReason" @send="sendToCar" />
        </section>

        <PitwallCarCard :session="session" :fresh="carFresh" :age-seconds="presenceAgeSeconds" :display-plan="mfdPlan" :drivers="drivers" :stop="stopEstimate">
          <template #order>
            <section v-if="link.orderProgress.value.label || fieldOutcomes.length" class="order-info" aria-label="Stato dell'ultimo ordine">
              <div class="order-info__head"><strong>Ultimo ordine</strong><span :class="{ 'is-problem': link.orderProgress.value.problem }">{{ link.orderProgress.value.label || 'Nessun ordine' }}</span></div>
              <p v-if="link.orderReason.value">{{ link.orderReason.value }}</p>
              <div v-if="fieldOutcomes.length" class="outcomes"><span v-for="item in fieldOutcomes" :key="item.field" :class="[`outcome`, `outcome--${item.outcome ?? 'none'}`]" :title="item.reason ?? ''">{{ item.label }} {{ item.outcome === 'verified' ? '✓' : item.outcome === 'selected' ? '→' : '—' }}</span></div>
            </section>
          </template>
        </PitwallCarCard>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.pitwall-page { max-width: 1500px; margin: 0 auto; padding: 14px 16px 24px; }
.pitwall { --accent-rgb: 53, 169, 242; --accent: #35a9f2; display: grid; gap: 14px; color: #f4f7fa; }
.page-title { margin: 0; font-size: 17px; font-weight: 850; letter-spacing: .01em; }
.connections { display: grid; grid-template-columns: .92fr .94fr 1.34fr; overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: rgba(255,255,255,.12); gap: 1px; }
.connection-cell { min-width: 0; min-height: 182px; padding: 17px 20px; background: #101820; }
.eyebrow { display: flex; align-items: center; gap: 10px; margin: 0 0 24px; color: #f5f7fa; font-size: 12px; font-weight: 850; letter-spacing: .02em; }
.eyebrow::before { content: ''; width: 9px; height: 9px; border-radius: 3px; background: #68717b; }
.eyebrow--green::before { background: #62d275; }.eyebrow--blue::before { background: #4eaef4; }.eyebrow--purple::before { background: #8d56e8; }
.active-pilot__name-row { display: flex; align-items: center; gap: 22px; margin-bottom: 18px; }.active-pilot__name-row > strong,.active-pilot__empty-title { font-size: 24px; font-weight: 780; }
.status-pill,.grant-pill { padding: 3px 8px; border: 1px solid rgba(255,255,255,.18); border-radius: 5px; color: #a9b4bf; font-size: 9px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
.status-pill.is-online,.grant-pill.is-permanent { border-color: rgba(74,198,91,.42); color: #62d26d; }.status-pill.is-offline { color: #818b95; }
.active-pilot__meta { display: flex; align-items: center; gap: 9px; margin: 10px 0; color: #e2e7ec; font-size: 12px; }.check { color: #53c866; font-weight: 900; }.clock { color: #77838e; font-size: 18px; }
.active-pilot__disconnect { float: right; margin-top: -36px; }.cell-note { margin: 16px 0 0; color: #a7b0ba; font-size: 12px; line-height: 1.55; }.cell-error { color: #ffbd55; font-size: 11px; }.cell-notice { color: #54b9f5; font-size: 11px; }
.search-input { width: 100%; min-height: 42px; padding: 0 14px; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; outline: 0; background: #0b1219; color: #fff; font: inherit; }.search-input:focus { border-color: rgba(53,169,242,.75); box-shadow: 0 0 0 3px rgba(53,169,242,.1); }.search-input::placeholder { color: #818b96; }
.search-results { display: grid; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }.search-results li { display: flex; align-items: center; gap: 6px; }.search-results strong { flex: 1; font-size: 12px; }
.recent-list { display: grid; max-height: 142px; overflow-y: auto; }.recent-row { display: grid; grid-template-columns: 10px minmax(76px,.55fr) minmax(150px,1.15fr) minmax(120px,auto); align-items: center; gap: 9px; min-height: 39px; border-bottom: 1px solid rgba(255,255,255,.08); }.recent-row:last-child { border-bottom: 0; }.recent-row strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.recent-row__detail { color: #9ca6b0; font-size: 11px; }.recent-row .btn { justify-self: end; width: 120px; }.recent-row--incoming .grant-pill { color: #b89ae9; }
.room-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; margin-top: 14px; }.select-control--room { min-width: 190px; }.recent-row__actions { display: flex; justify-content: flex-end; gap: 6px; }.recent-row__actions .btn { width: auto; padding: 4px 9px; }.presence-dot { width: 9px; height: 9px; border-radius: 3px; background: #737d87; }.presence-dot.is-driving { background: #35a9f2; box-shadow: 0 0 0 3px rgba(53,169,242,.22); }.presence-dot.is-online { background: #5fcf70; }.presence-dot.is-waiting { background: #ffbd55; }.presence-dot.is-incoming { background: #8d56e8; }
.btn { min-height: 34px; padding: 5px 12px; border: 1px solid rgba(53,169,242,.46); border-radius: 7px; background: rgba(18,91,137,.08); color: #55baf5; font: inherit; font-size: 11px; cursor: pointer; }.btn:hover:not(:disabled),.btn:focus-visible { background: rgba(53,169,242,.14); }.btn:disabled { opacity: .48; cursor: default; }.btn--primary { background: #35a9f2; color: #041019; font-weight: 800; }.btn--ghost { border-color: rgba(255,255,255,.13); color: #9ca7b2; background: transparent; }
.invite { padding: 10px 12px; border: 1px solid rgba(53,169,242,.45); border-radius: 9px; background: rgba(53,169,242,.08); }.invite__row { display: flex; align-items: center; gap: 8px; }.invite__row p { flex: 1; margin: 0; font-size: 12px; }
.workspace { display: grid; grid-template-columns: minmax(650px,760px) minmax(420px,520px); justify-content: start; gap: 12px; align-items: start; }
.strategy { display: flex; min-width: 0; flex-direction: column; gap: 10px; padding: 15px 14px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: #101820; }.panel-title { margin: 0 7px 2px; font-size: 16px; font-weight: 850; }.strategy__body { display: grid; gap: 9px; }.strategy-topline,.pit-services,.tyres-card { border: 1px solid rgba(255,255,255,.09); border-radius: 8px; background: rgba(255,255,255,.018); }
.strategy-topline { display: grid; grid-template-columns: max-content max-content; align-items: center; justify-content: start; gap: 48px; min-height: 56px; padding: 9px 16px; }.static-control { display: grid; grid-template-columns: 105px auto; align-items: center; gap: 14px; color: #d9e0e7; font-size: 12px; }.static-stepper { display: grid; grid-template-columns: 35px 78px 35px; align-items: center; overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; }.static-stepper button,.static-stepper strong { display: grid; place-items: center; height: 34px; padding: 0; line-height: 1; }.static-stepper button { border: 0; background: rgba(255,255,255,.05); color: #66717c; }.static-stepper strong { font-size: 12px; font-variant-numeric: tabular-nums; }
.tyres-card { padding: 13px 16px 12px; }.tyres-card h3 { margin: 0 0 8px; color: #dfe5eb; font-size: 12px; font-weight: 650; }.tyres-layout { display: grid; grid-template-columns: minmax(450px,1fr) 150px; min-height: 236px; }.pressure-map { position: relative; min-width: 0; border-right: 1px solid rgba(255,255,255,.13); }.car-silhouette { position: absolute; top: 0; left: 50%; width: 116px; height: 220px; object-fit: contain; transform: translateX(-50%); opacity: .92; user-select: none; -webkit-user-drag: none; }.tyre-control { position: absolute; z-index: 1; width: 140px; }.tyre-control--fl { top: 12px; left: 10px; }.tyre-control--fr { top: 12px; right: 10px; }.tyre-control--rl { bottom: 12px; left: 10px; }.tyre-control--rr { right: 10px; bottom: 12px; }
.tyre-settings { display: flex; flex-direction: column; justify-content: center; gap: 17px; padding-left: 20px; }.tyre-settings :deep(.field--bare) { display: grid; justify-items: stretch; gap: 7px; }.tyre-settings :deep(.field__head) { white-space: nowrap; }.tyre-settings :deep(.stepper) { width: 132px; }.tyre-settings :deep(.value) { width: 62px; min-width: 62px; max-width: 62px; }.select-control { display: flex; flex-direction: column; gap: 7px; color: #dce3e9; font-size: 12px; }.select-control select { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 7px; background: #0b1219; color: #fff; font: inherit; }.check-control { display: flex; align-items: center; gap: 9px; color: #dfe4e9; font-size: 12px; cursor: pointer; }.check-control input { width: 17px; height: 17px; margin: 0; accent-color: #35a9f2; }.check-control--disabled { opacity: .52; cursor: not-allowed; }
.pit-services { display: grid; grid-template-columns: minmax(360px,1fr) auto; align-items: center; padding: 9px 15px; }.service-row { display: grid; grid-template-columns: minmax(285px,360px) auto; align-items: center; gap: 28px; padding-right: 24px; border-right: 1px solid rgba(255,255,255,.09); }.select-control--driver { display: grid; grid-template-columns: 98px minmax(170px,250px); align-items: center; }.repairs { display: grid; grid-template-columns: 1fr; align-items: center; gap: 8px; min-width: 260px; margin: 0; padding: 0 0 0 24px; border: 0; }.repairs legend { grid-column: 1 / -1; padding: 0; margin-bottom: 4px; color: #85919d; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.order-info { padding: 10px 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(0,0,0,.12); }.order-info__head { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }.order-info__head span { color: #63d16f; }.order-info__head span.is-problem { color: #ffbd55; }.order-info p { margin: 7px 0 0; color: #9ba8b5; font-size: 11px; }.outcomes { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }.outcome { padding: 2px 6px; border: 1px solid rgba(255,255,255,.13); border-radius: 5px; color: #7d8995; font-size: 9px; }.outcome--verified { color: #63d16f; }.outcome--selected { color: #35a9f2; }
:deep(.field--bare) { min-width: 0; }:deep(.field--bare .field__head strong) { color: #dce3e9; font-size: 12px; font-weight: 500; letter-spacing: 0; }:deep(.field--bare .stepper) { gap: 0; overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; box-sizing: border-box; }:deep(.field--bare .stepper > button) { width: 35px; min-height: 34px; border: 0; border-radius: 0; background: rgba(255,255,255,.045); font-size: 16px; }:deep(.field--bare .value) { width: 70px; min-width: 70px; max-width: 70px; min-height: 34px; padding: 2px 7px; border-width: 0 1px; border-radius: 0; }:deep(.field--bare .value input) { font-size: 15px; font-weight: 800; text-align: center; }:deep(.field--bare .stepper__unit) { min-width: 25px; font-size: 10px; }:deep(.field--bare .echo) { display: none; }.strategy-topline :deep(.field--bare) { display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; }.strategy-topline :deep(.field__head) { white-space: nowrap; }.tyre-control :deep(.field--bare) { display: grid; gap: 6px; }.tyre-control :deep(.stepper) { display: grid; grid-template-columns: 34px 70px 34px; }.tyre-control :deep(.stepper > button) { width: 34px; }.tyre-control :deep(.field__head) { justify-content: flex-start; }.tyre-control :deep(.field__head strong) { color: #f3f5f7; font-size: 11px; font-weight: 650; }
@media (max-width: 1180px) { .connections { grid-template-columns: 1fr 1fr; }.connection-cell--recent { grid-column: 1 / -1; } }
@media (min-width: 1121px) and (max-width: 1280px) { .tyre-control--fl,.tyre-control--rl { left: 18px; }.tyre-control--fr,.tyre-control--rr { right: 18px; } }
@media (max-width: 1120px) { .workspace { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .pitwall-page { padding-inline: 10px; }.connections { grid-template-columns: 1fr; }.connection-cell--recent { grid-column: auto; }.recent-list { max-height: none; overflow-y: visible; }.strategy-topline,.pit-services,.service-row { grid-template-columns: 1fr; }.strategy-topline { gap: 14px; }.tyres-layout { grid-template-columns: 1fr; }.pressure-map { min-height: 280px; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.13); }.tyre-settings { padding: 18px 0 0; }.service-row { gap: 12px; padding: 0 0 12px; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.09); }.repairs { padding: 12px 0 0; }.recent-row { grid-template-columns: 10px 1fr; padding: 7px 0; }.recent-row > :nth-child(n+3) { grid-column: 2; }.recent-row .btn { justify-self: start; } }
@media (max-width: 480px) { .pressure-map { min-height: 348px; }.car-silhouette { top: 79px; width: 101px; height: 187px; }.tyre-control { width: 140px; }.tyre-control--fl { top: 8px; left: 0; }.tyre-control--fr { top: 8px; right: 0; }.tyre-control--rl { bottom: 10px; left: 0; }.tyre-control--rr { right: 0; bottom: 10px; }.tyre-control :deep(.stepper) { grid-template-columns: 44px 52px 44px; }.tyre-control :deep(.stepper > button) { width: 44px; min-height: 44px; }.tyre-control :deep(.value) { width: 52px; min-width: 52px; max-width: 52px; min-height: 44px; } }
</style>
