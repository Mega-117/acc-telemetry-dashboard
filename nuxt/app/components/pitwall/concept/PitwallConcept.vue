<script setup lang="ts">
// La Pit Wall (PIP-369, PIP-360, PIP-362). Legge lo store fornito
// dall'antenato: quello vero dall'app, quello del prototipo nella demo. I
// componenti non sanno quale.
//
// Due sole schermate, perche' l'utente ha due sole domande:
//   home -> "il mio Pitwall, e chi ha aperto il suo?"   live -> "cosa mando alla macchina?"
// Una sola relazione da capire: siamo amici. Aggiungi, accetta, apri il
// Pitwall, entra. Niente versi, niente scadenze, niente codici da girarsi.
// Le persone si chiamano col nickname e basta: nome e cognome non compaiono.
import { computed, ref, watch } from "vue";
import ScrollArea from "~/components/ui/ScrollArea.vue";
import PitwallConceptFeedback from "~/components/pitwall/concept/PitwallConceptFeedback.vue";
import PitwallConceptFriends from "~/components/pitwall/concept/PitwallConceptFriends.vue";
import PitwallConceptLive from "~/components/pitwall/concept/PitwallConceptLive.vue";
import PitwallConceptMyRoom from "~/components/pitwall/concept/PitwallConceptMyRoom.vue";
import PitwallConceptRaces from "~/components/pitwall/concept/PitwallConceptRaces.vue";
import PitwallConceptSearch from "~/components/pitwall/concept/PitwallConceptSearch.vue";
import { usePitwallStore } from "~/composables/usePitwallStore";
import { usePitwallConceptMode } from "~/composables/usePitwallConceptMode";
import type { PitwallConceptRace, PitwallConceptScreen } from "~/utils/pitwallConcept";

const state = usePitwallStore();

// La stanza resta nello store globale anche quando la pagina viene smontata.
const screen = ref<PitwallConceptScreen>("home");
const { homeRequest } = usePitwallConceptMode();
watch(homeRequest, () => go("home"));

/** Solo gli amici che hanno aperto il Pitwall: ci si entra con un clic. */
const races = computed(() => state.races.value);
/** Il mio Pitwall: `races` non lo contiene mai, per costruzione. */
const myRoom = computed(() => state.myRoom.value);
const pitwall = computed(() => state.pitwall.value);
const friends = computed(() => state.friends.value);
const people = computed(() => state.people.value);
const search = computed({
  get: () => state.searchQuery.value,
  set: (value: string) => { state.searchQuery.value = value; },
});
const found = computed(() => state.found.value);

/** Il primo avvio non deve essere tre riquadri vuoti senza un punto di partenza. */
const isFirstRun = computed(() => !friends.value.length);
const addingFriend = ref(false);

// La gara che si stava guardando non c'e' piu' (chiusa dal pilota, o non ne
// facciamo piu' parte): si torna alla home, invece di restare in una schermata
// che sembra una gara guasta.
watch(() => state.selectedRace.value, (race) => {
  if (!race && screen.value === "live") go("home");
});

function go(next: PitwallConceptScreen) {
  screen.value = next;
  if (next === "home") search.value = "";
  scrollToTop();
}

// La vista vive dentro una pagina che scrolla: cambiando schermata si riparte
// dall'alto, altrimenti si atterra a meta' della nuova.
function scrollToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "auto" });
  if (typeof document !== "undefined") document.documentElement.scrollTop = 0;
}

/**
 * Il pilota apre la propria gara come un ingegnere apre quella di un altro:
 * dentro trova l'equipaggio e, da manager, "+ Ospite", "Promuovi", "Togli" e
 * "Chiudi". E' l'unica porta verso i comandi che gia' esistevano.
 */
function openMine() {
  const mine = myRoom.value;
  if (!mine) return;
  state.enterRace(mine.id);
  go("live");
}

/** Entrare e aprire sono lo stesso gesto: chi era invitato smette di esserlo. */
function enter(race: PitwallConceptRace) {
  enterById(race.id);
}

function enterById(raceId: string) {
  state.enterRace(raceId);
  go("live");
}

/** Aggiungere e' chiedere: quando accetta, siete amici. */
function add(personId: string) {
  state.befriend(personId);
  search.value = "";
}
</script>

<template>
  <section
    class="pwc"
    :class="{ 'pwc--home': screen === 'home', 'pwc--live': screen !== 'home' }"
    data-testid="pitwall-concept"
  >
    <!-- HOME: il mio Pitwall, chi ha aperto il suo, gli amici -->
    <div
      v-if="screen === 'home'"
      class="pwc-home"
    >
      <!-- Il tuo Pitwall sta in cima: chi guida apre questa pagina per
           aprirlo o per sapere se il muretto lo vede, non per assistere. -->
      <h1 class="sr-only">Pitwall</h1>
      <div class="pwc-home__main">
      <section class="pwc-home__mine">
        <header class="pwc-block__head">
          <h2 class="pwc-block__title">
            Il tuo Pitwall
          </h2>
        </header>

        <PitwallConceptMyRoom
          :room="myRoom"
          :pitwall="pitwall"
          :people="people"
          :me-id="state.meId.value"
          @start="state.startPitwall()"
          @close="state.closePitwall()"
          @open="openMine"
        />
      </section>

      <section class="pwc-home__races">
        <header class="pwc-block__head">
          <h2 class="pwc-block__title">
            Pitwall aperti
          </h2>
          <!-- Gli elenchi ai tetti veri del servizio. Serve a guardare gli edge
               case invece di descriverli, ed esiste solo nella demo. -->
          <button
            v-if="state.demo"
            type="button"
            class="pwc-link-btn"
            :class="{ 'is-on': state.crowded.value }"
            @click="state.toggleCrowded()"
          >
            {{ state.crowded.value ? "Torna ai dati di esempio" : "Molti dati" }}
          </button>
        </header>

        <p
          v-if="isFirstRun"
          class="pwc-start"
        >
          Aggiungi un amico dalla rubrica per trovare il suo Pitwall.
        </p>

        <ScrollArea class="pwc-room-scroll" label="Pitwall aperti">
        <PitwallConceptRaces
          :races="races"
          :people="people"
          :me-id="state.meId.value"
          @enter="enter"
        />
        </ScrollArea>
      </section>

      </div>
      <aside class="pwc-home__social" aria-label="Amici e richieste">
        <PitwallConceptFriends
          class="pwc-home__friends"
          :friends="friends"
          :people="people"
          :adding="addingFriend"
          @accept="state.befriend($event)"
          @remove="state.unfriend($event)"
          @enter="enterById"
        >
          <template #heading-action>
            <button type="button" class="pwc-link-btn" :aria-expanded="addingFriend" @click="addingFriend = !addingFriend; search = ''">
              {{ addingFriend ? 'Torna agli amici' : '+ Aggiungi' }}
            </button>
          </template>
          <template #search>
            <PitwallConceptSearch v-model="search" :found="found" linked-label="Già collegato">
              <template #actions="{ person }">
                <button type="button" class="pwc-btn" @click="add(person.id)">Aggiungi</button>
              </template>
            </PitwallConceptSearch>
          </template>
        </PitwallConceptFriends>
      </aside>
      <PitwallConceptFeedback class="pwc-home__feedback" :error="state.error.value" :notice="state.notice.value" :warning="state.clockWarning.value" />
    </div>

    <template v-else>
      <PitwallConceptFeedback :error="state.error.value" :notice="state.notice.value" :warning="state.clockWarning.value" />
      <PitwallConceptLive @back="go('home')" />
    </template>
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;
@use "@/assets/scss/racing-settings" as racing;

/* Ritmo unico: passo verticale 8px, tre livelli di superficie, un solo accento.
   Niente strati di override sovrapposti: se una regola non serve, si toglie.
   Qui vivono le basi condivise anche dalla schermata gara. */
.pwc {
  --pwc-line: rgba(255, 255, 255, 0.1);
  --pwc-surface: #11161f;
  --pwc-raised: #161d28;
  --pwc-gap: 16px;

  /* Il controllo a tre stati arriva dalla Classica e legge questi nomi: qui si
     veste con la palette del Concept invece di essere duplicato per il colore. */
  --pitwall-accent: #e0210b;
  --pitwall-border: rgba(255, 255, 255, 0.12);
  --pitwall-text: #fff;
  --pitwall-text-muted: #{$text-secondary};

  min-height: calc(100vh - 72px);
  padding: 32px clamp(20px, 4vw, 56px) 56px;
  background: transparent;
  color: $text-primary;
  font-family: $font-primary;
}

.pwc *,
.pwc *::before,
.pwc *::after { box-sizing: border-box; }

.pwc button,
.pwc input,
.pwc select { font: inherit; }

.pwc h1,
.pwc h2,
.pwc strong,
.pwc b { font-family: $font-display; }

.pwc h1 { margin: 0; font-size: 24px; letter-spacing: -0.01em; }
.pwc h2 { margin: 0; font-size: 18px; }
.pwc small { color: $text-secondary; }

.pwc button:focus-visible,
.pwc input:focus-visible,
.pwc select:focus-visible {
  outline: 2px solid $racing-orange;
  outline-offset: 2px;
}

/* La riga dei servizi: sopra tutto, e sparisce da sola quando non c'e' niente. */
.pwc-flash {
  width: min(1180px, 100%);
  margin: 0 auto 20px;
  padding: 10px 14px;
  border: 1px solid rgba(74, 222, 128, 0.45);
  border-radius: 8px;
  color: #4ade80;
  font-size: 13px;
}
.pwc-flash.is-error { border-color: rgba(239, 68, 68, 0.5); color: #ff625c; }
/* Ambra e non rosso: non e' rotto niente, c'e' da sistemare una cosa fuori. */
.pwc-flash.is-warn { border-color: rgba(245, 158, 11, 0.55); color: #f59e0b; }

/* Elementi condivisi */
.pwc-btn {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid var(--pwc-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.pwc-btn:hover { border-color: rgba(255, 107, 0, 0.6); background: rgba(255, 107, 0, 0.08); }
.pwc-btn.is-primary { border-color: #ff3d16; background: #e0210b; }
.pwc-btn.is-primary:hover { background: #f5290f; }
.pwc-btn.is-active { border-color: rgba(255, 107, 0, 0.8); background: rgba(255, 107, 0, 0.12); }
/* Un solo gesto distruttivo nel prototipo, e si vede che lo e'. */
.pwc-btn.is-danger { border-color: rgba(239, 68, 68, 0.6); background: rgba(239, 68, 68, 0.14); }
.pwc-btn.is-danger:hover { border-color: #ef4444; background: rgba(239, 68, 68, 0.24); }

.pwc-link-btn {
  padding: 0;
  border: 0;
  background: none;
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
}
.pwc-link-btn:hover { color: #ff6b6b; }

.pwc-back {
  padding: 0;
  border: 0;
  background: none;
  color: $text-secondary;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}
.pwc-back:hover { color: #fff; }

.pwc-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  font-family: $font-display;
  font-size: 12px;
}
.pwc-avatar.is-small { width: 26px; height: 26px; font-size: 10px; }

.pwc-chip {
  padding: 5px 12px;
  border: 1px solid;
  border-radius: 99px;
  background: none;
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.pwc-chip.is-always { border-color: rgba(74, 222, 128, 0.45); color: #4ade80; }
/* Le due facce della stessa richiesta: chi aspetta e' spento, chi deve
   rispondere e' acceso, perche' e' l'unico dei due che puo' fare qualcosa. */
.pwc-chip.is-waiting { border-color: var(--pwc-line); color: $text-muted; }
.pwc-chip.is-asking { border-color: rgba(255, 107, 0, 0.55); color: $racing-orange; }

.pwc-empty { margin: 0; padding: 20px 0 4px; color: $text-muted; font-size: 14px; }
.pwc-start {
  margin: var(--pwc-gap) 0 0;
  padding: 18px 20px;
  border: 1px dashed var(--pwc-line);
  border-radius: 12px;
  color: $text-secondary;
  font-size: 14px;
  line-height: 1.5;
}

.pwc-search {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  margin-top: var(--pwc-gap);
  padding: 0 16px;
  border: 1px solid var(--pwc-line);
  border-radius: 10px;
  background: var(--pwc-surface);
}
.pwc-search:focus-within { border-color: rgba(255, 107, 0, 0.6); }
.pwc-search svg { width: 20px; flex: none; fill: none; stroke: $text-secondary; stroke-width: 1.6; }
.pwc-search input { width: 100%; border: 0; outline: 0; background: none; color: #fff; font-size: 15px; }
.pwc-search button { border: 0; background: none; color: $text-secondary; font-size: 22px; cursor: pointer; }

.pwc-people { display: grid; gap: 8px; margin: var(--pwc-gap) 0 0; padding: 0; list-style: none; }
.pwc-person {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  min-height: 58px;
  padding: 10px 18px;
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-surface);
}
.pwc-person__name { font-size: 15px; overflow-wrap: anywhere; }
.pwc-person.is-add { grid-template-columns: 36px minmax(0, 1fr) auto; }
.pwc-person__actions { display: flex; align-items: center; gap: 12px; }

/* Una riga che chiede una decisione ha tre bottoni, e in mezza pagina non ci
   stanno accanto al nome: schiacciavano la colonna del nickname al punto da
   impilare le lettere. Le azioni scendono su una riga loro. */
.pwc-person.is-deciding { grid-template-columns: 36px minmax(0, 1fr) auto; }
.pwc-person.is-deciding .pwc-person__actions { grid-column: 2 / -1; justify-self: start; }

/* "In pista" accanto al nickname: dice perche' vale la pena guardare
   quella persona proprio ora, senza aggiungere una colonna. */
.pwc-live-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  white-space: nowrap;
  color: #4ade80;
  font-family: $font-primary;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.pwc-live-dot::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Togliere qualcuno dice cosa succede, e lo dice prima di farlo. */
.pwc-confirm {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--pwc-line);
  color: $text-secondary;
  font-size: 13px;
}
.pwc-confirm__actions { display: flex; align-items: center; gap: 16px; margin-left: auto; }

/* Pannello: lo usano sia la tabella del pit stop sia l'equipaggio. */
.pwc-panel {
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-raised);
  overflow: hidden;
}
.pwc-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
}

.pwc-role { display: grid; gap: 6px; }
.pwc-role small { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.pwc-role b { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.pwc-role em { color: $text-muted; font-size: 12px; font-style: normal; }

/* Home: il mio Pitwall e i Pitwall aperti a fascia intera; sotto, amici e
   ricerca affiancati: sono le due meta' dello stesso gesto e crescono insieme. */
.pwc-home {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 40px 28px;
  width: min(1180px, 100%);
  margin: 0 auto;
}
.pwc-home__mine,
.pwc-home__races { grid-column: 1 / -1; }
/* La ricerca ha una superficie sua: senza, a campo vuoto sembra uno spazio
   dimenticato invece di un pannello che aspetta. */
.pwc-home__add {
  align-self: start;
  padding: 20px 22px 24px;
  border: 1px solid var(--pwc-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.015);
}
.pwc-home__add .pwc-person { background: var(--pwc-raised); }

.pwc-block__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.pwc-block__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: $text-secondary;
}
.pwc-block__hint { margin: 6px 0 0; color: $text-muted; font-size: 13px; }

/* Adattamento */
@media (max-width: 980px) {
  .pwc-home { grid-template-columns: 1fr; gap: 36px; }
  .pwc-home__mine,
  .pwc-home__races,
  .pwc-home__friends,
  .pwc-home__add { grid-column: 1; }
}

@media (max-width: 760px) {
  .pwc { padding: 24px 16px 40px; }
  .pwc-home { gap: 32px; }
  .pwc-person,
  .pwc-person.is-add { grid-template-columns: 36px minmax(0, 1fr); row-gap: 12px; }
  .pwc-person .pwc-chip,
  .pwc-person__actions { grid-column: 2; justify-self: start; }
  .pwc-person__actions { flex-wrap: wrap; }
  .pwc-confirm__actions { margin-left: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .pwc * { transition: none !important; }
}

// Landing page only: the live room keeps its existing controls and layout.
.pwc.pwc--home {
  @include racing.tokens;
  --rc-control-height: 34px;
  --pwc-line: var(--rc-line);
  --pwc-surface: transparent;
  --pwc-raised: transparent;
  width: 100%;
  max-width: var(--app-content-max-width, 1400px);
  min-height: 0;
  margin: 0 auto;
  padding: var(--app-content-top-space, 40px) 24px 32px;
  font-size: 13px;

  .pwc-home { width: 100%; height: clamp(440px, calc(100dvh - 250px), 680px); grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: minmax(0, 1fr) 56px; gap: 16px 24px; align-items: stretch; padding: 24px 24px 0; border: 1px solid var(--rc-line); background: #00000018; }
  .pwc-home__main { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0,1fr); gap: 24px; }
  .pwc-home__social { min-width: 0; min-height: 0; padding-left: 24px; border-left: 1px solid var(--rc-line); display: flex; flex-direction: column; }
  .pwc-home__mine, .pwc-home__races { grid-column: auto; min-height: 0; }
  .pwc-home__mine { max-height: 180px; overflow-y: auto; }
  .pwc-home__races { display: flex; flex-direction: column; }
  .pwc-home__races > .pwc-block__head, .pwc-side > .pwc-block__head, .pwc-social-tabs, .pwc-search { flex-shrink: 0; }
  .pwc-home__races > .pwc-start { margin: 0 0 12px; }
  .pwc-room-scroll, .pwc-social-scroll, .pwc-find__results { min-height: 0; flex: 1; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; padding-right: 8px; }
  .pwc-side, .pwc-find { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .pwc-home__feedback { grid-column: 1 / -1; min-height: 0; overflow-y: auto; border-top: 1px solid var(--rc-line); padding: 8px 0; }
  .pwc-home__feedback .pwc-flash { width: 100%; margin: 0; padding: 4px 0; border: 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .pwc-search input:focus-visible { outline: none; }

  h2, strong, b { font-family: var(--rc-font), sans-serif; }
  .pwc-block__title { font-size: 12px; letter-spacing: .08em; }
  .pwc-block__head { min-height: 34px; margin-bottom: 12px; }
  .pwc-btn { @include racing.action; padding: 7px 14px; }
  .pwc-btn.is-primary { @include racing.primary; }
  .pwc-btn.is-danger { color: #ff6178; background: #ff002419; }
  .pwc-link-btn { min-height: 32px; font-size: 12px; }
  button:focus-visible, input:focus-visible { outline-color: #fff; }
  .pwc-btn:focus-visible { outline-offset: -3px; }
  .pwc-panel, .pwc-race, .pwc-person, .pwc-search, .pwc-flash { border-radius: 0; }
  .pwc-chip { border: 0; padding: 0; font-size: 11px; }
  .pwc-chip.is-asking { color: #ffc400; }
  .pwc-avatar { width: 28px; height: 28px; font-size: 10px; border-color: var(--rc-line); }
  .pwc-race__copy strong { font-size: 14px; line-height: 1.4; }
  .pwc-race__copy small { font-size: 12px; line-height: 1.5; }
  .pwc-race__copy { gap: 6px; }
  .pwc-mine { padding: 16px; gap: 16px; border-color: var(--rc-line); }
  .pwc-mine .pwc-avatar { display: none; }
  .pwc-mine__actions { flex-wrap: wrap; gap: 12px; }
  .pwc-race { grid-template-columns: minmax(0,1fr) minmax(110px,.6fr) auto; gap: 24px; margin: 0; padding: 20px 0; border: 0; border-bottom: 1px solid var(--rc-line); background: transparent; }
  .pwc-race:hover { background: #ffffff06; }
  .pwc-race > .pwc-avatar, .pwc-race__who > .pwc-avatar { display: none; }
  .pwc-race__wall { grid-column: auto; min-width: 0; }
  .pwc-race__wall b { font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
  .pwc-invitation { color: #ffc400; }
  .pwc-role { gap: 6px; }
  .pwc-role small { font-size: 10px; color: var(--rc-muted); }
  .pwc-race__why { padding-top: 12px; font-size: 12px; line-height: 1.5; }
  .pwc-people { gap: 0; margin-top: 12px; }
  .pwc-person, .pwc-person.is-deciding, .pwc-person.is-add {
    grid-template-columns: 28px minmax(0,1fr); gap: 8px 12px; padding: 14px 0;
    border: 0; border-bottom: 1px solid var(--rc-line); background: transparent;
  }
  .pwc-person__name { font-size: 13px; font-weight: 600; }
  .pwc-person > .pwc-chip, .pwc-person__actions, .pwc-person.is-deciding .pwc-person__actions { grid-column: 2; justify-self: start; }
  .pwc-person > span:empty { display: none; }
  .pwc-person__actions { flex-wrap: wrap; gap: 12px; }
  .pwc-search, .pwc-search.is-slim { min-height: 34px; padding: 0 10px; margin: 12px 0 0; background: transparent; }
  .pwc-search input, .pwc-search.is-slim input { font-size: 12px; min-width: 0; }
  .pwc-search:focus-within { border-color: #ffffff80; }
  .pwc-search svg { width: 16px; }
  .pwc-empty { font-size: 12px; line-height: 1.6; padding-top: 12px; }
  .pwc-start { border: 0; border-radius: 0; padding: 0; font-size: 12px; }
  .pwc-social-tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--rc-line); }
  .pwc-social-tabs button { min-height: 34px; padding: 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--rc-muted); cursor: pointer; font-size: 12px; }
  .pwc-social-tabs button[aria-pressed="true"] { color: #fff; border-bottom-color: var(--racing-race, #ff0024); }
  .pwc-social-tabs span { margin-left: 5px; font-variant-numeric: tabular-nums; }
  @media(max-width: 1000px) {
    .pwc-home { grid-template-columns: minmax(0,1fr) 290px; gap: 24px; }
    .pwc-home__social { padding-left: 20px; }
    .pwc-mine { grid-template-columns: 1fr auto; }
    .pwc-mine__actions { grid-column: 1 / -1; }
    .pwc-race { grid-template-columns: minmax(0,1fr) auto; gap: 12px; }
    .pwc-race__wall { grid-column: 1; grid-row: 2; }
    .pwc-race > .pwc-btn { grid-column: 2; grid-row: 1 / 3; }
  }
  @media(max-width: 720px) {
    padding-right: 16px; padding-left: 16px;
    .pwc-home { height: 760px; grid-template-columns: minmax(0,1fr); grid-template-rows: minmax(0,1fr) minmax(0,1fr) 56px; gap: 16px; padding: 16px 16px 0; }
    .pwc-home__social { padding: 16px 0 0; border-left: 0; border-top: 1px solid var(--rc-line); }
    .pwc-mine, .pwc-mine.is-off { grid-template-columns: 1fr; }
    .pwc-mine > .pwc-btn { justify-self: start; }
  }
}

.pwc.pwc--live {
  @include racing.tokens;
  --rc-control-height: 34px;
  --pwc-line: var(--rc-line); --pwc-raised: transparent; --pwc-surface: transparent;
  width: 100%; max-width: var(--app-content-max-width,1400px); margin: 0 auto;
  padding: var(--app-content-top-space,40px) 24px 32px; font-size: 13px;
  .pwc-live { grid-template-columns: minmax(0,1fr) 260px; gap: 16px 24px; align-items: start; }
  .pwc-live__back, .pwc-live__heading { grid-column: 1 / -1; }
  .pwc-live__heading { width: 100%; margin: 0; padding: 0; display:flex; justify-content:space-between; align-items:center; }
  .pwc-live__heading h2 { font-size: 18px; margin: 0 0 8px; }
  .pwc-strategy { grid-column: 1; grid-row: 3; min-width: 0; }
  .pwc-roster { grid-column: 2; grid-row: 3; padding: 0 16px; }
  .pwc-panel { background: transparent; border: 1px solid var(--rc-line); border-radius: 0; }
  .pwc-panel__head { padding: 16px; gap: 12px; border: 0; }
  .pwc-panel__head h2 { font-size: 13px; margin: 0; }
  .pwc-roster .pwc-panel__head { padding: 16px 0; }
  .pwc-roster__row { grid-template-columns: 8px 24px minmax(0,1fr); padding: 12px 0; gap: 6px 8px; }
  .pwc-roster__row > .pwc-chip { grid-column: 3; justify-self: start; }
  .pwc-roster__row .pwc-person__actions:empty { display: none; }
  .pwc-roster__foot { padding: 12px 0; }
  .pwc-person__name { font-size: 13px; }
  .pwc-chip, .pwc-fresh { border: 0; background: transparent; padding: 0; font-size: 11px; }
  .pwc-recipient { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 0 16px 12px; font-size: 12px; }
  .pwc-recipient select { @include racing.select; width: 210px; }
  .pwc-btn { @include racing.action; }
  .pwc-btn.is-primary { @include racing.primary; }
  .pwc-link-btn { font-size: 12px; min-height: 32px; }
  .pwc-flash { border-radius: 0; margin: 0 0 16px; padding: 8px 12px; font-size: 12px; }
  @media (max-width: 1000px) {
    .pwc-live { grid-template-columns: minmax(0,1fr); }
    .pwc-roster { grid-column: 1; grid-row: 3; }
    .pwc-strategy { grid-column: 1; grid-row: 4; }
  }
}
</style>
