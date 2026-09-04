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
import PitwallConceptFriends from "~/components/pitwall/concept/PitwallConceptFriends.vue";
import PitwallConceptLive from "~/components/pitwall/concept/PitwallConceptLive.vue";
import PitwallConceptMyRoom from "~/components/pitwall/concept/PitwallConceptMyRoom.vue";
import PitwallConceptRaces from "~/components/pitwall/concept/PitwallConceptRaces.vue";
import PitwallConceptSearch from "~/components/pitwall/concept/PitwallConceptSearch.vue";
import { usePitwallStore } from "~/composables/usePitwallStore";
import type { PitwallConceptRace, PitwallConceptScreen } from "~/utils/pitwallConcept";

const state = usePitwallStore();

const screen = ref<PitwallConceptScreen>("home");

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
    data-testid="pitwall-concept"
  >
    <!-- I servizi parlano qui, in italiano: un errore di rete o una risposta
         del server non restano muti. -->
    <p
      v-if="state.error.value"
      class="pwc-flash is-error"
      role="alert"
    >
      {{ state.error.value }}
    </p>
    <p
      v-else-if="state.notice.value"
      class="pwc-flash"
      role="status"
    >
      {{ state.notice.value }}
    </p>

    <!-- HOME: il mio Pitwall, chi ha aperto il suo, gli amici -->
    <div
      v-if="screen === 'home'"
      class="pwc-home"
    >
      <!-- Il tuo Pitwall sta in cima: chi guida apre questa pagina per
           aprirlo o per sapere se il muretto lo vede, non per assistere. -->
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
          Si comincia da un amico: cerca il suo nickname qui sotto e aggiungilo.
          Quando accetta, vedrai il suo Pitwall appena lo apre, e lui il tuo.
        </p>

        <PitwallConceptRaces
          :races="races"
          :people="people"
          :me-id="state.meId.value"
          @enter="enter"
        />
      </section>

      <!-- Gli amici e la ricerca affiancati: sono le due meta' dello stesso
           gesto, e vederle insieme toglie la scheda che ne nascondeva una. -->
      <PitwallConceptFriends
        class="pwc-home__friends"
        :friends="friends"
        :people="people"
        @accept="state.befriend($event)"
        @remove="state.unfriend($event)"
        @enter="enterById"
      />

      <section class="pwc-home__add">
        <h2 class="pwc-block__title">
          Aggiungi un amico
        </h2>
        <p class="pwc-block__hint">
          Cerca il nickname e aggiungilo: quando accetta, siete amici.
        </p>

        <PitwallConceptSearch
          v-model="search"
          :found="found"
          linked-label="Già fra gli amici"
        >
          <template #actions="{ person }">
            <button
              type="button"
              class="pwc-btn is-primary"
              @click="add(person.id)"
            >
              Aggiungi
            </button>
          </template>
        </PitwallConceptSearch>
      </section>
    </div>

    <PitwallConceptLive
      v-else
      @back="go('home')"
    />
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

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
  background: #0a0d13;
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
</style>
