<script setup lang="ts">
// Prototipo navigabile del Pit Wall (PIP-369). Solo stato locale e fixture:
// nessun servizio reale, nessun Firebase, nessun IPC.
//
// Due sole schermate, perche' l'utente ha due sole domande:
//   home -> "chi posso assistere adesso?"   live -> "cosa mando alla macchina?"
// La gestione delle persone e' un gesto secondario dentro la home, non un
// percorso a se': collegarsi non richiede prima di fondare una squadra.
// Le persone si chiamano col nickname e basta: nome e cognome non compaiono.
import { computed, reactive, ref } from "vue";
import PitwallConceptExpiry from "~/components/pitwall/concept/PitwallConceptExpiry.vue";
import PitwallConceptLive from "~/components/pitwall/concept/PitwallConceptLive.vue";
import {
  PITWALL_CONCEPT_DEFAULT_EXPIRY,
  PITWALL_CONCEPT_RACES,
  describePitwallConceptAccess,
  getPitwallConceptLinks,
  normalizePitwallConceptExpiry,
  pitwallConceptInitials,
  pitwallConceptInitialsById,
  pitwallConceptNickname,
  pitwallConceptNicknameById,
  searchPitwallConceptDirectory,
} from "~/utils/pitwallConcept";
import type {
  PitwallConceptDirection,
  PitwallConceptLink,
  PitwallConceptScreen,
} from "~/utils/pitwallConcept";

const screen = ref<PitwallConceptScreen>("home");
const direction = ref<PitwallConceptDirection>("assist");
const search = ref("");

// Copia locale dei due elenchi: aggiungere e rimuovere deve vedersi subito.
const links = reactive<Record<PitwallConceptDirection, PitwallConceptLink[]>>({
  assist: [...getPitwallConceptLinks("assist")],
  assisted: [...getPitwallConceptLinks("assisted")],
});

// L'orario di scadenza si sceglie qui: quando concedi l'accesso a tempo, e ogni
// volta che vuoi cambiarlo dalla scheda della persona.
const expiry = ref<{ personId: string; mode: "add" | "edit"; time: string } | null>(null);

const races = ref([...PITWALL_CONCEPT_RACES]);
const visibleLinks = computed(() => links[direction.value]);
const searchResults = computed(() => searchPitwallConceptDirectory(search.value));

function go(next: PitwallConceptScreen) {
  screen.value = next;
  if (next === "home") search.value = "";
  expiry.value = null;
  scrollToTop();
}

// La vista vive dentro una pagina che scrolla: cambiando schermata si riparte
// dall'alto, altrimenti si atterra a meta' della nuova.
function scrollToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "auto" });
  if (typeof document !== "undefined") document.documentElement.scrollTop = 0;
}

function openExpiry(personId: string, mode: "add" | "edit", current?: string) {
  expiry.value = { personId, mode, time: current ?? PITWALL_CONCEPT_DEFAULT_EXPIRY };
}

function confirmExpiry() {
  const pending = expiry.value;
  if (!pending) return;
  const until = normalizePitwallConceptExpiry(pending.time);
  if (pending.mode === "add") {
    addTodayLink(pending.personId, until);
  } else {
    const link = links[direction.value].find(item => item.personId === pending.personId);
    if (link) link.until = until;
  }
  expiry.value = null;
}

function addTodayLink(personId: string, until: string) {
  if (links.assist.some(link => link.personId === personId)) return;
  links.assist.push({ personId, access: "today", until });
  direction.value = "assist";
  search.value = "";
}

function addAlwaysLink(personId: string) {
  if (links.assist.some(link => link.personId === personId)) return;
  links.assist.push({ personId, access: "always" });
  direction.value = "assist";
  search.value = "";
  expiry.value = null;
}

function removeLink(personId: string) {
  const list = links[direction.value];
  const index = list.findIndex(link => link.personId === personId);
  if (index >= 0) list.splice(index, 1);
  if (expiry.value?.personId === personId) expiry.value = null;
}
</script>

<template>
  <section
    class="pwc"
    data-testid="pitwall-concept"
  >
    <!-- HOME: chi posso assistere adesso -->
    <div
      v-if="screen === 'home'"
      class="pwc-home"
    >
      <section class="pwc-home__races">
        <h2 class="pwc-block__title">
          In gara adesso
        </h2>

        <article
          v-for="race in races"
          :key="race.id"
          class="pwc-race"
        >
          <div class="pwc-race__car">
            <span class="pwc-race__number">#{{ race.carNumber }}</span>
            <span class="pwc-race__copy">
              <strong>{{ race.carModel }}</strong>
              <small>{{ race.track }} · {{ race.session }}</small>
            </span>
          </div>

          <div class="pwc-race__roles">
            <span class="pwc-role">
              <small>Al volante</small>
              <b>{{ pitwallConceptNicknameById(race.driverId) }}</b>
            </span>
            <span
              v-if="race.wallIds.length"
              class="pwc-role"
            >
              <small>Al muretto</small>
              <b>{{ race.wallIds.map(id => pitwallConceptNicknameById(id)).join(", ") }}</b>
            </span>
          </div>

          <button
            type="button"
            class="pwc-btn is-primary"
            @click="go('live')"
          >
            Entra
          </button>

          <p class="pwc-race__why">
            Sei dentro perché
            <b>{{ pitwallConceptNicknameById(race.reasonPersonId) }}</b>
            ti ha autorizzato.
          </p>
        </article>

        <p
          v-if="!races.length"
          class="pwc-empty"
        >
          Nessuna gara attiva fra le tue persone.
        </p>
      </section>

      <section>
        <header class="pwc-block__head">
          <h2 class="pwc-block__title">
            Le mie persone
          </h2>
          <div
            class="pwc-tabs"
            role="tablist"
            aria-label="Verso dell'accesso"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="direction === 'assist'"
              :class="{ 'is-active': direction === 'assist' }"
              @click="direction = 'assist'"
            >
              Posso assistere
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="direction === 'assisted'"
              :class="{ 'is-active': direction === 'assisted' }"
              @click="direction = 'assisted'"
            >
              Possono assistermi
            </button>
          </div>
        </header>

        <ul
          v-if="visibleLinks.length"
          class="pwc-people"
        >
          <li
            v-for="link in visibleLinks"
            :key="link.personId"
            class="pwc-person"
          >
            <span class="pwc-avatar">{{ pitwallConceptInitialsById(link.personId) }}</span>
            <strong class="pwc-person__name">{{ pitwallConceptNicknameById(link.personId) }}</strong>

            <button
              v-if="link.access === 'today'"
              type="button"
              class="pwc-chip is-today is-editable"
              :aria-label="`Cambia scadenza di ${pitwallConceptNicknameById(link.personId)}`"
              @click="openExpiry(link.personId, 'edit', link.until)"
            >
              {{ describePitwallConceptAccess(link) }}
            </button>
            <span
              v-else
              class="pwc-chip is-always"
            >
              {{ describePitwallConceptAccess(link) }}
            </span>

            <button
              type="button"
              class="pwc-link-btn"
              :aria-label="`Rimuovi ${pitwallConceptNicknameById(link.personId)}`"
              @click="removeLink(link.personId)"
            >
              Rimuovi
            </button>

            <PitwallConceptExpiry
              v-if="expiry && expiry.mode === 'edit' && expiry.personId === link.personId"
              v-model="expiry.time"
              confirm-label="Salva"
              @confirm="confirmExpiry"
              @cancel="expiry = null"
            />
          </li>
        </ul>
        <p
          v-else
          class="pwc-empty"
        >
          Nessuna persona in questo elenco.
        </p>
      </section>

      <section class="pwc-home__add">
        <h2 class="pwc-block__title">
          Aggiungi una persona
        </h2>
        <p class="pwc-block__hint">
          Cerca il nickname e scegli per quanto vale l'accesso.
        </p>

        <label class="pwc-search">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
            />
            <path d="m16.5 16.5 4 4" />
          </svg>
          <input
            v-model="search"
            placeholder="Cerca nickname"
            aria-label="Cerca nickname"
          >
          <button
            v-if="search"
            type="button"
            aria-label="Cancella ricerca"
            @click="search = ''"
          >
            ×
          </button>
        </label>

        <ul
          v-if="search && searchResults.length"
          class="pwc-people"
        >
          <li
            v-for="found in searchResults"
            :key="found.id"
            class="pwc-person is-add"
          >
            <span class="pwc-avatar">{{ pitwallConceptInitials(found) }}</span>
            <strong class="pwc-person__name">{{ pitwallConceptNickname(found) }}</strong>
            <span class="pwc-add">
              <button
                type="button"
                class="pwc-btn"
                :class="{ 'is-active': expiry?.personId === found.id }"
                @click="openExpiry(found.id, 'add')"
              >
                Solo per oggi
              </button>
              <button
                type="button"
                class="pwc-btn is-primary"
                @click="addAlwaysLink(found.id)"
              >
                Sempre
              </button>
            </span>

            <PitwallConceptExpiry
              v-if="expiry && expiry.mode === 'add' && expiry.personId === found.id"
              v-model="expiry.time"
              confirm-label="Aggiungi"
              @confirm="confirmExpiry"
              @cancel="expiry = null"
            />
          </li>
        </ul>
        <p
          v-else-if="search"
          class="pwc-empty"
        >
          Nessuno con questo nickname.
        </p>
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
.pwc-chip.is-today { border-color: rgba(167, 139, 250, 0.45); color: #a78bfa; }
.pwc-chip.is-editable { cursor: pointer; }
.pwc-chip.is-editable:hover { border-color: #a78bfa; background: rgba(167, 139, 250, 0.1); }

.pwc-empty { margin: 0; padding: 20px 0 4px; color: $text-muted; font-size: 14px; }

.pwc-tabs { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--pwc-line); border-radius: 10px; }
.pwc-tabs button {
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: $text-secondary;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.pwc-tabs button.is-active { background: rgba(255, 255, 255, 0.08); color: #fff; }

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
.pwc-add { display: flex; gap: 8px; }

.pwc-role { display: grid; gap: 6px; }
.pwc-role small { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.pwc-role b { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.pwc-role em { color: $text-muted; font-size: 12px; font-style: normal; }

/* Home: la gara occupa la fascia intera, sotto due colonne affiancate. */
.pwc-home {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 40px 28px;
  width: min(1180px, 100%);
  margin: 0 auto;
}
.pwc-home__races { grid-column: 1 / -1; }
/* La colonna di destra ha una superficie sua: senza, a ricerca vuota sembra
   uno spazio dimenticato invece di un pannello che aspetta. */
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

.pwc-race {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 24px;
  margin-top: var(--pwc-gap);
  padding: 20px 24px;
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 14px;
  background: var(--pwc-raised);
}
.pwc-race__car { display: flex; align-items: center; gap: 16px; min-width: 0; }
.pwc-race__number {
  flex: none;
  font-family: $font-display;
  font-size: 26px;
  color: $racing-gold;
  font-variant-numeric: tabular-nums;
}
.pwc-race__copy { display: grid; gap: 4px; min-width: 0; }
.pwc-race__copy strong { font-size: 17px; }
.pwc-race__copy small { font-size: 13px; }
.pwc-race__roles { display: flex; gap: 28px; }
.pwc-race__why {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid var(--pwc-line);
  color: $text-muted;
  font-size: 13px;
}
.pwc-race__why b { color: $text-secondary; font-weight: 700; }

/* Adattamento */
@media (max-width: 1180px) {
  .pwc-race { grid-template-columns: minmax(0, 1fr) auto; }
  .pwc-race__roles { grid-column: 1 / -1; }
  /* Il bottone scende su una riga sua: resta della sua misura, non a tutta larghezza. */
  .pwc-race > .pwc-btn { justify-self: start; }
}

@media (max-width: 980px) {
  .pwc-home { grid-template-columns: 1fr; gap: 36px; }
  .pwc-home__races { grid-column: 1; }
}

@media (max-width: 760px) {
  .pwc { padding: 24px 16px 40px; }
  .pwc-home { gap: 32px; }
  .pwc-race { grid-template-columns: 1fr; }
  .pwc-person,
  .pwc-person.is-add { grid-template-columns: 36px minmax(0, 1fr); row-gap: 12px; }
  .pwc-person .pwc-chip,
  .pwc-person .pwc-link-btn,
  .pwc-add { grid-column: 2; justify-self: start; }
}

@media (prefers-reduced-motion: reduce) {
  .pwc * { transition: none !important; }
}
</style>
