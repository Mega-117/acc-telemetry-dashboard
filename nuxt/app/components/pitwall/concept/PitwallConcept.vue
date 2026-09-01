<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";
import {
  PITWALL_CONCEPT_CREWS,
  PITWALL_CONCEPT_CREW_IMAGES,
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  PITWALL_CONCEPT_PEOPLE,
  PITWALL_CONCEPT_RECENTS,
  describePitwallConceptAccess,
  filterPitwallConceptPeople,
  getPitwallConceptCrewMembers,
  stepPitwallConceptPressure,
  type PitwallConceptCrew,
  type PitwallConceptLiveTab,
  type PitwallConceptScreen,
} from "~/utils/pitwallConcept";

const screen = ref<PitwallConceptScreen>("home");
const search = ref("");
const submittedSearch = ref("");
const liveTab = ref<PitwallConceptLiveTab>("timing");
const guestOpen = ref(false);
const guestSelected = ref("alessandro");
const invitees = ref(["mario", "luca"]);
const crewName = ref("Apex One Racing");
const crewDescription = ref("Endurance, campionato e allenamenti insieme");
const crewImageId = ref("apex-red");
const sent = ref(false);
const accessMenu = ref<string | null>(null);
const expandedCrewId = ref<string | null>(null);
const DEFAULT_CREW_IMAGE = PITWALL_CONCEPT_CREW_IMAGES[0]!;
const searchResults = computed(() =>
  submittedSearch.value
    ? filterPitwallConceptPeople(submittedSearch.value)
    : [],
);
const recentPeople = computed(() =>
  PITWALL_CONCEPT_RECENTS.flatMap((recent) => {
    const person = PITWALL_CONCEPT_PEOPLE.find((item) => item.id === recent.id);
    return person ? [person] : [];
  }),
);
const selectedCrewImage = computed(() =>
  PITWALL_CONCEPT_CREW_IMAGES.find((image) => image.id === crewImageId.value)
    ?? DEFAULT_CREW_IMAGE,
);
const invitationPeople = computed(() =>
  PITWALL_CONCEPT_PEOPLE.filter((person) =>
    ["mario", "luca", "paolo"].includes(person.id),
  ),
);
const pressures = reactive<Record<"FL" | "FR" | "RL" | "RR", number>>({
  ...PITWALL_CONCEPT_DEFAULT_PRESSURES,
});
const strategy = reactive({
  preset: "Nessun cambio",
  fuel: 0,
  tyres: false,
  tyreSet: 1,
  compound: "Dry",
  brakes: false,
  driver: "Nessun cambio",
  suspension: false,
  bodywork: false,
});

function go(next: PitwallConceptScreen) {
  screen.value = next;
  sent.value = false;
  if (next === "home") {
    clearSearch();
    expandedCrewId.value = null;
  }
  void nextTick(() => {
    const conceptRoot = document.querySelector<HTMLElement>(
      '[data-testid="pitwall-concept"]',
    );
    let scrollParent = conceptRoot?.parentElement ?? null;
    while (scrollParent) {
      scrollParent.scrollTop = 0;
      scrollParent = scrollParent.parentElement;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}

function toggleInvitee(id: string) {
  invitees.value = invitees.value.includes(id)
    ? invitees.value.filter((item) => item !== id)
    : [...invitees.value, id];
}

function submitSearch() {
  submittedSearch.value = search.value.trim();
}

function clearSearch() {
  search.value = "";
  submittedSearch.value = "";
}

function toggleAccessMenu(scope: "search" | "recent", personId: string) {
  const key = `${scope}:${personId}`;
  accessMenu.value = accessMenu.value === key ? null : key;
}

function closeAccessMenu() {
  accessMenu.value = null;
}

function toggleCrew(crewId: string) {
  expandedCrewId.value = expandedCrewId.value === crewId ? null : crewId;
}

function crewMembers(crew: PitwallConceptCrew) {
  return getPitwallConceptCrewMembers(crew);
}

function stepPressure(wheel: keyof typeof pressures, direction: 1 | -1) {
  pressures[wheel] = stepPitwallConceptPressure(pressures[wheel], direction);
}

function stepAll(direction: 1 | -1) {
  (Object.keys(pressures) as (keyof typeof pressures)[]).forEach((wheel) =>
    stepPressure(wheel, direction),
  );
}

function crewImage(imageId: string) {
  return PITWALL_CONCEPT_CREW_IMAGES.find((image) => image.id === imageId)
    ?? DEFAULT_CREW_IMAGE;
}
</script>

<template>
  <section
    class="pwc"
    data-testid="pitwall-concept"
  >
    <template v-if="screen === 'home'">
      <div class="pwc-home">
        <main class="pwc-home__main">
          <section class="pwc-find-panel">
            <header><h2>Piloti</h2></header> <form
              class="pwc-find-form"
              @submit.prevent="submitSearch"
            >
              <label class="pwc-search"> <input
                v-model="search"
                placeholder="Cerca nome o nickname"
                aria-label="Cerca nome o nickname"
              /> <button
                v-if="search"
                type="button"
                aria-label="Cancella ricerca"
                @click="clearSearch"
              >×</button> <button
                type="submit"
                class="pwc-search-submit"
                aria-label="Cerca persone"
              > <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg> </button> </label>
            </form> <div
              v-if="submittedSearch"
              class="pwc-search-outcome"
              aria-live="polite"
            >
              <template v-if="searchResults.length">
                <article
                  v-for="person in searchResults"
                  :key="person.id"
                  class="pwc-search-person"
                >
                  <span
                    class="pwc-avatar"
                    :class="`is-${person.source}`"
                  >{{ person.initials }}</span> <span class="pwc-person-copy">
                    <strong>{{ person.handle.replace('@', '') }}</strong>
                    <small v-if="describePitwallConceptAccess(person.access)">{{ describePitwallConceptAccess(person.access) }}</small>
                  </span> <button
                    v-if="person.access !== 'none'"
                    type="button"
                    class="pwc-btn is-primary"
                    @click="go('live')"
                  >Collegati</button> <div
                    v-else
                    class="pwc-access-request"
                    @keydown.esc="closeAccessMenu"
                  >
                    <button
                      type="button"
                      class="pwc-btn is-outline"
                      :aria-expanded="accessMenu === `search:${person.id}`"
                      :aria-controls="`search-access-${person.id}`"
                      @click="toggleAccessMenu('search', person.id)"
                    >Richiedi accesso</button>
                    <div
                      v-if="accessMenu === `search:${person.id}`"
                      :id="`search-access-${person.id}`"
                      class="pwc-request-menu"
                      aria-label="Tipo di accesso"
                    >
                      <button type="button" @click="closeAccessMenu">Per questa gara</button>
                      <button type="button" @click="closeAccessMenu">Permanente</button>
                    </div>
                  </div>
                </article>
              </template> <div
                v-else
                class="pwc-search-empty"
              >
                <span>?</span> <div> <strong>Nessun utente trovato</strong> <small>Controlla il nickname e riprova.</small> </div>
              </div>
            </div>
          </section>
        </main> <aside class="pwc-home-sidebar">
          <section class="pwc-crews">
            <header>
              <div>
                <span class="pwc-eyebrow">Accessi permanenti</span>
                <h2>Le mie Crew</h2>
              </div>
              <button
                class="pwc-btn is-outline"
                @click="go('crew-create-identity')"
              >
                + Crea
              </button>
            </header>
            <article
              v-for="crew in PITWALL_CONCEPT_CREWS"
              :key="crew.id"
              class="pwc-crew-disclosure"
              :class="`is-${crew.tone}`"
            >
              <button
                type="button"
                class="pwc-crew-card"
                :aria-expanded="expandedCrewId === crew.id"
                :aria-controls="`crew-members-${crew.id}`"
                @click="toggleCrew(crew.id)"
              >
                <img
                  class="pwc-crew-image"
                  :src="crewImage(crew.imageId).src"
                  :alt="`Copertina ${crew.name}`"
                />
                <span>
                  <strong>{{ crew.name }}</strong>
                  <small>{{ crew.memberIds.length }} membri</small>
                </span>
                <svg
                  class="pwc-crew-chevron"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <div
                v-if="expandedCrewId === crew.id"
                :id="`crew-members-${crew.id}`"
                class="pwc-crew-members"
              >
                <div class="pwc-crew-member-list">
                  <div
                    v-for="person in crewMembers(crew)"
                    :key="person.id"
                    class="pwc-crew-member"
                  >
                    <span class="pwc-avatar">{{ person.initials }}</span>
                    <strong>{{ person.handle.replace('@', '') }}</strong>
                    <button
                      type="button"
                      class="pwc-btn is-primary"
                      @click="go('live')"
                    >Collegati</button>
                  </div>
                </div>
                <button
                  type="button"
                  class="pwc-open-crew"
                  @click="go('crew-detail')"
                >Apri Crew <span aria-hidden="true">→</span></button>
              </div>
            </article>
          </section>
          <section class="pwc-recents">
            <header> <span class="pwc-eyebrow">Ultimi cinque</span> <h2>Recenti</h2> </header> <article
              v-for="person in recentPeople"
              :key="person.id"
              class="pwc-recent-person"
            >
              <span class="pwc-avatar">{{ person.initials }}</span> <span class="pwc-person-copy">
                <strong>{{ person.handle.replace('@', '') }}</strong>
                <small v-if="describePitwallConceptAccess(person.access)">{{ describePitwallConceptAccess(person.access) }}</small>
              </span> <button
                v-if="person.access !== 'none'"
                type="button"
                class="pwc-btn is-primary"
                @click="go('live')"
              >Collegati</button> <div
                v-else
                class="pwc-access-request"
                @keydown.esc="closeAccessMenu"
              >
                <button
                  type="button"
                  class="pwc-btn is-outline"
                  :aria-expanded="accessMenu === `recent:${person.id}`"
                  :aria-controls="`recent-access-${person.id}`"
                  @click="toggleAccessMenu('recent', person.id)"
                >Richiedi accesso</button>
                <div
                  v-if="accessMenu === `recent:${person.id}`"
                  :id="`recent-access-${person.id}`"
                  class="pwc-request-menu"
                  aria-label="Tipo di accesso"
                >
                  <button type="button" @click="closeAccessMenu">Per questa gara</button>
                  <button type="button" @click="closeAccessMenu">Permanente</button>
                </div>
              </div>
            </article>
          </section>
        </aside>
      </div>
    </template> <template v-else-if=" screen === 'crew-create-identity' || screen === 'crew-create-people' ">
      <div class="pwc-flow">
        <button
          class="pwc-back"
          @click="go('home')"
        >
          ← Torna al Pit Wall
        </button> <h1>Crea una Crew</h1> <div class="pwc-steps">
          <button :class="{ active: screen === 'crew-create-identity', done: screen === 'crew-create-people', }">
            <b>1</b> Identità
          </button> <i> </i> <button :class="{ active: screen === 'crew-create-people' }">
            <b>2</b> Persone
          </button>
        </div> <form
          v-if="screen === 'crew-create-identity'"
          class="pwc-flow-card"
          @submit.prevent="go('crew-create-people')"
        >
          <h2>Crea la tua Crew</h2> <label>Nome <em>*</em> <input
            v-model="crewName"
            required
          /> </label> <label>Descrizione <small>opzionale</small> <textarea
            v-model="crewDescription"
            rows="4"
          > </textarea> </label> <fieldset class="pwc-image-picker">
            <legend>Immagine Crew</legend> <p>Scegli una delle sei copertine disponibili.</p> <div>
              <button
                v-for="image in PITWALL_CONCEPT_CREW_IMAGES"
                :key="image.id"
                type="button"
                :class="{ active: crewImageId === image.id }"
                :aria-pressed="crewImageId === image.id"
                @click="crewImageId = image.id"
              >
                <img
                  :src="image.src"
                  alt=""
                /> <span>{{ image.label }}</span>
              </button>
            </div>
          </fieldset> <p class="pwc-info">
            ⓘ I membri che accetteranno potranno assistersi reciprocamente durante le gare.
          </p> <footer>
            <button
              type="button"
              class="pwc-btn"
              @click="go('home')"
            >
              Annulla
            </button> <button class="pwc-btn is-primary">
              Continua
            </button>
          </footer>
        </form> <div
          v-else
          class="pwc-flow-card is-wide"
        >
          <section>
            <h2>Chi vuoi invitare?</h2> <p>Puoi aggiungere altre persone anche dopo.</p> <label class="pwc-search is-small"> <input placeholder="Cerca nome o nickname…" /> </label> <article
              v-for="person in invitationPeople"
              :key="person.id"
              class="pwc-invite-row"
            >
              <div> <strong>{{ person.name }}</strong> <small>{{ person.handle }}</small> </div> <button
                class="pwc-btn"
                :class="{ 'is-added': invitees.includes(person.id) }"
                @click="toggleInvitee(person.id)"
              >
                {{ invitees.includes(person.id) ? "Aggiunto" : "Aggiungi" }}
              </button>
            </article>
          </section> <aside>
            <h3>Invitati · {{ invitees.length }}</h3> <article
              v-for="id in invitees"
              :key="id"
            >
              <strong>{{ PITWALL_CONCEPT_PEOPLE.find((item) => item.id === id)?.name }}</strong> <button @click="toggleInvitee(id)">
                Rimuovi
              </button>
            </article>
          </aside> <footer>
            <button
              class="pwc-btn"
              @click="go('crew-create-identity')"
            >
              Indietro
            </button> <button
              class="pwc-btn"
              @click="go('crew-detail')"
            >
              Salta
            </button> <button
              class="pwc-btn is-primary"
              @click="go('crew-detail')"
            >
              Crea e invita
            </button>
          </footer>
        </div>
      </div>
    </template> <template v-else-if="screen === 'crew-detail'">
      <div class="pwc-crew-page">
        <button
          class="pwc-back"
          @click="go('home')"
        >
          ← Le mie Crew
        </button> <header>
          <img
            class="pwc-crew-page__image"
            :src="selectedCrewImage.src"
            :alt="`Copertina ${crewName || 'Crew'}`"
          /> <div> <h1>{{ crewName || "Apex One Racing" }}</h1> <p>{{ crewDescription }}</p> </div> <div>
            <span>4 membri</span> <button class="pwc-btn is-outline">
              + Invita
            </button> <button class="pwc-btn">
              Impostazioni
            </button>
          </div>
        </header> <div class="pwc-crew-grid">
          <main>
            <h2>Attività della Crew</h2> <article class="pwc-race-card">
              <header> <span class="pwc-tag is-green">Live</span> <h3>Ferrari 296 GT3 · Monza</h3> <small>Endurance</small> </header> <div class="pwc-race-stats">
                <div> <b>P7</b> <small>Posizione</small> </div> <div> <b>18 / 42</b> <small>Giro</small> </div> <div> <b>31 min</b> <small>Stint attuale</small> </div> <div> <b>24–27</b> <small>Pit window</small> </div>
              </div> <div class="pwc-race-people">
                <p>
                  <span>◉</span> <b>Mario Rossi</b> <small>Al volante</small> <button
                    class="pwc-btn"
                    @click="go('live')"
                  >
                    Assisti
                  </button>
                </p> <p> <span>○</span> <b>Luca Bianchi</b> <small>Disponibile</small> </p> <p> <span>◉</span> <b>Enrico Saiani</b> <small>Sta assistendo</small> </p>
              </div>
            </article> <h2>Attività recenti</h2> <article class="pwc-recent">
              <b>Luca</b> <span>Spa</span> <span>terminata 1 ora fa</span> <button class="pwc-btn">
                Riepilogo
              </button>
            </article>
          </main> <aside>
            <h2>Persone · 6</h2> <label class="pwc-search is-small"> <input placeholder="Cerca nella Crew…" /> </label> <div class="pwc-filters">
              <button class="active">
                Tutte
              </button> <button>Online</button> <button>In attesa</button>
            </div> <article
              v-for="(row, index) in [ ['Mario Rossi', 'In gara', 'Al volante'], ['Enrico Saiani', 'Disponibile', 'Proprietario · Tu'], ['Luca Bianchi', 'Disponibile', 'Membro'], ['Sara Neri', 'Offline', 'Membro'], ['Paolo Verdi', 'Invito in attesa', '2 giorni'], ['Andrea Sala', 'Invito in attesa', 'oggi'], ]"
              :key="row[0]"
              class="pwc-roster-row"
            >
              <span :class="{ online: index < 3, waiting: index > 3 }"> </span> <strong>{{ row[0] }}</strong> <div> <b>{{ row[1] }}</b> <small>{{ row[2] }}</small> </div> <button
                v-if="index > 3"
                class="pwc-btn"
              >
                Annulla
              </button>
            </article>
          </aside>
        </div>
      </div>
    </template> <template v-else>
      <div class="pwc-live">
        <header class="pwc-command">
          <button
            class="pwc-back"
            @click="go('home')"
          >
            ← Assistenza live
          </button> <div> <h1>Enrico Saiani</h1> <p>Ferrari 296 GT3 · Nürburgring</p> </div> <div class="pwc-command__stats">
            <span> <b>P6</b> </span> <span> <small>Giro</small> <b>42/67</b> </span> <span> <small>Stint</small> <b>38:14</b> </span>
          </div> <div class="pwc-online">
            <b>● Live</b> <small>Connessione stabile</small>
          </div>
        </header> <section class="pwc-wall">
          <div> <small>Al volante</small> <p> <span class="pwc-avatar">ES</span> <b>Enrico Saiani<small>Pilota</small> </b> </p> </div> <div> <small>Al muretto</small> <p> <span class="pwc-avatar">MC</span> <b>Marco<small>Race Engineer</small> </b> <span class="pwc-avatar">LC</span> <b>Luca<small>Strategist</small> </b> </p> </div> <button
            class="pwc-btn is-outline"
            @click="guestOpen = true"
          >
            + Ospite
          </button>
        </section> <div class="pwc-live-grid">
          <main class="pwc-race-view">
            <header>
              <h2>{{ liveTab === "timing" ? "Timing" : "Pista" }}</h2> <nav>
                <button
                  :class="{ active: liveTab === 'timing' }"
                  @click="liveTab = 'timing'"
                >
                  Timing
                </button> <button
                  :class="{ active: liveTab === 'track' }"
                  @click="liveTab = 'track'"
                >
                  Pista
                </button>
              </nav>
            </header> <table
              v-if="liveTab === 'timing'"
              class="pwc-timing"
            >
              <thead> <tr> <th>Pos</th> <th>Pilota</th> <th>Gap</th> <th>Ultimo giro</th> </tr> </thead> <tbody>
                <tr> <td>P5</td> <td>A. Costa</td> <td>+2.341</td> <td>1:54.682</td> </tr> <tr class="is-me">
                  <td>P6</td> <td>Enrico Saiani</td> <td>—</td> <td>1:55.178</td>
                </tr> <tr> <td>P7</td> <td>M. Bianchi</td> <td>+1.879</td> <td>1:55.924</td> </tr> <tr> <td>P8</td> <td>T. Moretti</td> <td>+3.412</td> <td>1:56.311</td> </tr>
              </tbody>
            </table> <div
              v-else
              class="pwc-track"
            >
              <div class="pwc-track__labels">
                <p> <b>P1</b> Leader <small>1:53.217</small> </p> <p class="is-me">
                  <b>P6</b> Enrico Saiani <small>1:55.178</small>
                </p> <p> <b>P5</b> Auto davanti <small>+2.341</small> </p> <p> <b>P7</b> Auto dietro <small>+1.879</small> </p>
              </div> <svg
                viewBox="0 0 440 230"
                role="img"
                aria-label="Mappa Nürburgring"
              > <path d="M80 55c38-30 95 8 119-10 37-27 96 5 91 42-4 28 60 22 68 58 7 31-34 27-58 40-43 24-56-19-96 4-31 18-83 8-91-27-8-34 42-30 21-62-18-43-86-3-54-45z" /> <circle
                cx="307"
                cy="156"
                r="12"
              /> <text
                x="302"
                y="161"
              >P6</text> </svg>
            </div> <table class="pwc-sectors">
              <thead> <tr> <th>Settori</th> <th>S1</th> <th>S2</th> <th>S3</th> </tr> </thead> <tbody>
                <tr>
                  <td>Ultimo giro</td> <td class="purple">
                    31.482
                  </td> <td>41.762</td> <td>41.934</td>
                </tr> <tr> <td>Migliori settori</td> <td>31.214</td> <td>41.533</td> <td>41.621</td> </tr>
              </tbody>
            </table> <div class="pwc-metrics">
              <div> <small>Passo 5 giri</small> <b>1:55.386</b> <em>−0.287 vs best</em> </div> <div> <small>Carburante</small> <b>22.4 L</b> <em>28%</em> </div> <div> <small>Autonomia</small> <b>10 giri</b> <em>fino a giro 52</em> </div>
            </div>
          </main> <aside class="pwc-pit">
            <header> <h2>Pit Stop</h2> <p>Strategia da inviare e MFD in macchina</p> </header> <div class="pwc-pit-head">
              <b>Campo</b> <b>Strategia</b> <b>MFD live</b>
            </div> <div class="pwc-pit-row">
              <span>Strategia Pit</span> <select v-model="strategy.preset">
                <option>Nessun cambio</option> <option>Preset 1</option>
              </select> <b>N/D</b>
            </div> <div class="pwc-pit-row">
              <span>Aggiungi carburante</span> <div class="pwc-step">
                <button @click="strategy.fuel = Math.max(0, strategy.fuel - 1)">
                  −
                </button> <b>{{ strategy.fuel }} L</b> <button @click="strategy.fuel++">
                  +
                </button>
              </div> <b>0 L</b>
            </div> <div class="pwc-pit-row">
              <span>Cambio gomme</span> <label> <input
                v-model="strategy.tyres"
                type="checkbox"
              /> {{ strategy.tyres ? "Sì" : "No" }}</label> <b>No</b>
            </div> <div class="pwc-pit-row">
              <span>Set pneumatici</span> <div class="pwc-step">
                <button @click="strategy.tyreSet = Math.max(1, strategy.tyreSet - 1)">
                  −
                </button> <b>{{ strategy.tyreSet }}</b> <button @click="strategy.tyreSet++">
                  +
                </button>
              </div> <b>1</b>
            </div> <div class="pwc-pit-row">
              <span>Mescola</span> <select v-model="strategy.compound">
                <option>Dry</option> <option>Wet</option>
              </select> <b>Dry</b>
            </div> <div class="pwc-pit-row">
              <span>Pressioni</span> <div class="pwc-step">
                <button @click="stepAll(-1)">
                  −
                </button> <b>Tutte</b> <button @click="stepAll(1)">
                  +
                </button>
              </div> <b>—</b>
            </div> <div
              v-for="wheel in ['FL', 'FR', 'RL', 'RR'] as const"
              :key="wheel"
              class="pwc-pit-row is-sub"
            >
              <span>{{ wheel }}</span> <div class="pwc-step">
                <button @click="stepPressure(wheel, -1)">
                  −
                </button> <b>{{ pressures[wheel].toFixed(1) }}</b> <button @click="stepPressure(wheel, 1)">
                  +
                </button>
              </div> <b>25.0</b>
            </div> <div class="pwc-pit-row">
              <span>Sostituisci freni</span> <label> <input
                v-model="strategy.brakes"
                type="checkbox"
              /> {{ strategy.brakes ? "Sì" : "No" }}</label> <b>No</b>
            </div> <div class="pwc-pit-row">
              <span>Prossimo pilota</span> <select v-model="strategy.driver">
                <option>Nessun cambio</option> <option>Luca Bianchi</option>
              </select> <b>Nessun cambio</b>
            </div> <div class="pwc-pit-row">
              <span>Sospensioni</span> <label> <input
                v-model="strategy.suspension"
                type="checkbox"
              /> {{ strategy.suspension ? "Sì" : "No" }}</label> <b>No</b>
            </div> <div class="pwc-pit-row">
              <span>Carrozzeria</span> <label> <input
                v-model="strategy.bodywork"
                type="checkbox"
              /> {{ strategy.bodywork ? "Sì" : "No" }}</label> <b>No</b>
            </div> <div class="pwc-pit-row">
              <span>Tempo richiesto</span> <b>00:30.000</b> <b>—</b>
            </div> <button
              class="pwc-send"
              @click="sent = true"
            >
              {{ sent ? "Strategia inviata · mock" : "Invia strategia" }}
            </button>
          </aside>
        </div> <footer class="pwc-stint">
          <span>Stint attuale <b>38:14</b> </span> <span>Carburante <b>22.4 L (28%)</b> </span> <span>Fine finestra pit <b>Giri 45–49</b> </span>
        </footer>
      </div>
    </template> <div
      v-if="guestOpen"
      class="pwc-modal-backdrop"
      @click.self="guestOpen = false"
    >
      <section class="pwc-guest">
        <button
          class="pwc-close"
          @click="guestOpen = false"
        >
          ×
        </button> <h2>Invita un ospite al muretto</h2> <p>L’accesso vale solo per questa gara.</p> <label class="pwc-search is-small"> <input placeholder="Cerca una persona…" /> </label> <article
          v-for="guest in [ { id: 'alessandro', name: 'Alessandro Neri', initials: 'AN' }, { id: 'giulia', name: 'Giulia Ferrari', initials: 'GF' }, ]"
          :key="guest.id"
        >
          <span class="pwc-avatar">{{ guest.initials }}</span> <strong>{{ guest.name }}</strong> <button
            class="pwc-btn"
            @click="guestSelected = guest.id"
          >
            {{ guestSelected === guest.id ? "Selezionato" : "Invita" }}
          </button>
        </article> <div class="pwc-guest__selected">
          <span class="pwc-avatar">{{ guestSelected === "alessandro" ? "AN" : "GF" }}</span> <b>{{ guestSelected === "alessandro" ? "Alessandro Neri" : "Giulia Ferrari" }}<small>Selezionato</small> </b>
        </div> <button
          class="pwc-send"
          @click="guestOpen = false"
        >
          Invia invito
        </button>
      </section>
    </div>
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *; .pwc { min-height: calc(100vh - 72px); padding: 22px clamp(20px, 3vw, 48px) 36px; background: radial-gradient(circle at 75% 15%, rgba(225, 6, 0, 0.035), transparent 32%), #0a0d13; color: $text-primary; font-family: $font-primary; } .pwc * { box-sizing: border-box; } .pwc button, .pwc input, .pwc textarea, .pwc select { font: inherit; } .pwc h1, .pwc h2, .pwc h3, .pwc strong, .pwc b { font-family: $font-display; } .pwc h1 { margin: 0; font-size: clamp(30px, 2.6vw, 40px); letter-spacing: -0.02em; } .pwc h2 { margin: 0; } .pwc small { display: block; color: $text-secondary; } .pwc-kicker { display: block; margin-bottom: 4px; color: $racing-orange; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; } .pwc-btn { min-height: 38px; padding: 0 14px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; background: rgba(255, 255, 255, 0.035); color: #fff; font-weight: 700; cursor: pointer; transition: background 0.15s, border-color 0.15s, transform 0.15s; } .pwc-btn:hover { border-color: rgba(255, 107, 0, 0.65); background: rgba(255, 107, 0, 0.08); } .pwc-btn:active { transform: translateY(1px); } .pwc button:focus-visible, .pwc input:focus-visible, .pwc textarea:focus-visible, .pwc select:focus-visible { outline: 2px solid $racing-orange; outline-offset: 2px; } .pwc-btn.is-primary, .pwc-send { border-color: #ff3d16; background: #ef230c; box-shadow: 0 8px 24px rgba(225, 6, 0, 0.18); } .pwc-btn.is-outline { border-color: rgba(255, 107, 0, 0.7); color: $racing-orange; background: transparent; } .pwc-back { padding: 0; border: 0; background: none; color: $text-secondary; cursor: pointer; text-transform: uppercase; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; } .pwc-back:hover { color: #fff; } .pwc-search { display: flex; align-items: center; gap: 12px; width: min(100%, 800px); min-height: 52px; margin-top: 18px; padding: 0 16px; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 9px; background: rgba(9, 13, 20, 0.72); } .pwc-search:focus-within { border-color: #8b5cf6; box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.25); } .pwc-search svg { width: 24px; fill: none; stroke: $text-secondary; stroke-width: 1.5; } .pwc-search input { width: 100%; border: 0; outline: 0; background: none; color: #fff; font-size: 17px; } .pwc-search button { border: 0; background: none; color: $text-secondary; font-size: 26px; cursor: pointer; } .pwc-search.is-small { min-height: 46px; margin: 14px 0; padding: 0 14px; } .pwc-search.is-small input { font-size: 14px; } .pwc-home { display: grid; grid-template-columns: minmax(0, 2.1fr) minmax(330px, 0.9fr); gap: 24px; max-width: 1540px; margin: 0 auto; } .pwc-home__main { min-width: 0; } .pwc-crews { align-self: start; padding: 22px; border: 1px solid rgba(225, 70, 45, 0.28); border-radius: 16px; background: rgba(18, 18, 26, 0.64); } .pwc-crews > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; } .pwc-crews h2 { font-size: 22px; } .pwc-section-title { display: flex; align-items: center; gap: 9px; margin: 24px 0 14px; font-size: 20px; } .pwc-section-title span, .pwc-live-dot { width: 10px; height: 10px; border-radius: 50%; background: $accent-success; box-shadow: 0 0 14px rgba(34, 197, 94, 0.4); } .pwc-section-title small { font-size: 18px; } .pwc-driver-list { display: grid; gap: 12px; } .pwc-driver-card { display: grid; grid-template-columns: 12px 52px 1.15fr 1.4fr 0.55fr 0.8fr auto; align-items: center; gap: 14px; min-height: 106px; padding: 16px 20px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 14px; background: rgba(17, 21, 29, 0.68); } .pwc-driver-card.is-crew { border-color: rgba(34, 197, 94, 0.35); background: linear-gradient( 90deg, rgba(34, 197, 94, 0.08), rgba(17, 21, 29, 0.72) 40% ); } .pwc-driver-card.is-guest { border-color: rgba(139, 92, 246, 0.35); background: linear-gradient( 90deg, rgba(139, 92, 246, 0.08), rgba(17, 21, 29, 0.72) 40% ); } .pwc-driver-card > div { min-width: 0; } .pwc-driver-card strong { display: block; font-size: 17px; } .pwc-driver-card small { margin-top: 6px; } .pwc-live-dot.is-violet { background: #8b5cf6; } .pwc-avatar { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 50%; background: rgba(0, 0, 0, 0.18); font-weight: 700; } .pwc-avatar.is-guest, .pwc-avatar.is-global { border-color: rgba(139, 92, 246, 0.7); color: #c4b5fd; } .pwc-tag { display: inline-flex !important; width: max-content; margin-top: 6px !important; padding: 3px 8px; border: 1px solid; border-radius: 99px; text-transform: uppercase; font-size: 11px !important; font-weight: 800; } .pwc-tag.is-green { border-color: rgba(34, 197, 94, 0.65); color: #4ade80; } .pwc-tag.is-violet { border-color: rgba(139, 92, 246, 0.65); color: #a78bfa; } .pwc-crew-card { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 14px; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; background: rgba(255, 255, 255, 0.025); } .pwc-crew-card.is-green { border-color: rgba(34, 197, 94, 0.35); background: rgba(34, 197, 94, 0.055); } .pwc-crew-card.is-violet { border-color: rgba(139, 92, 246, 0.35); background: rgba(139, 92, 246, 0.055); } .pwc-crew-card strong { font-size: 18px; } .pwc-crew-card small { margin-top: 6px; } .pwc-crew-icon { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid currentColor; border-radius: 50%; color: #4ade80; font-size: 24px; } .pwc-search-results { margin-top: 16px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 14px; background: rgba(18, 18, 26, 0.64); overflow: hidden; } .pwc-search-results h2 { padding: 16px 18px 10px; color: $text-secondary; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; } .pwc-person-row { display: grid; grid-template-columns: 52px 1.35fr 0.8fr auto; align-items: center; gap: 16px; padding: 14px 18px; border-top: 1px solid rgba(255, 255, 255, 0.075); } .pwc-person-row strong { display: block; } .pwc-person-row small { margin-top: 4px; } .pwc-state { font-size: 14px; color: $text-secondary; } .pwc-state.is-racing { color: #4ade80; } .pwc-empty { padding: 28px; text-align: center; color: $text-secondary; } .pwc-flow, .pwc-crew-page, .pwc-live { max-width: 1540px; margin: 0 auto; } .pwc-flow > h1 { margin: 10px 0 18px; } .pwc-steps { display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; } .pwc-steps i { width: 40px; height: 1px; background: rgba(255, 255, 255, 0.2); } .pwc-steps button { display: flex; align-items: center; gap: 12px; min-width: 180px; height: 48px; padding: 0 16px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; background: rgba(255, 255, 255, 0.025); color: $text-muted; } .pwc-steps button.active { border-color: $racing-orange; color: #fff; box-shadow: 0 0 0 1px rgba(225, 6, 0, 0.35); } .pwc-steps button.done { color: #fff; } .pwc-steps b { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid currentColor; border-radius: 50%; } .pwc-flow-card { display: grid; gap: 18px; width: min(820px, 100%); margin: 0 auto; padding: 26px; border: 1px solid rgba(225, 70, 45, 0.28); border-radius: 16px; background: rgba(18, 18, 26, 0.72); } .pwc-flow-card > label { display: grid; gap: 9px; font-weight: 600; } .pwc-flow-card label small { display: inline; } .pwc-flow-card label em { color: $racing-orange; } .pwc-flow-card input, .pwc-flow-card textarea { width: 100%; padding: 14px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 8px; outline: 0; background: #0c1119; color: #fff; resize: vertical; } .pwc-flow-card textarea { min-height: 96px; } .pwc-flow-card input:focus, .pwc-flow-card textarea:focus { border-color: $racing-orange; } .pwc-info { margin: 0; padding: 12px 14px; border-radius: 8px; background: rgba(59, 130, 246, 0.06); color: $text-secondary; } .pwc-flow-card footer { display: flex; justify-content: flex-end; gap: 12px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1); } .pwc-flow-card.is-wide { grid-template-columns: 1.1fr 0.9fr; width: min(980px, 100%); } .pwc-flow-card.is-wide > section, .pwc-flow-card.is-wide > aside { padding: 0 6px; } .pwc-flow-card.is-wide > aside { border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; overflow: hidden; } .pwc-flow-card.is-wide > aside h3, .pwc-flow-card.is-wide > aside article { display: flex; align-items: center; justify-content: space-between; margin: 0; padding: 15px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); } .pwc-flow-card.is-wide > aside article button { border: 0; background: none; color: $racing-orange; cursor: pointer; } .pwc-flow-card.is-wide footer { grid-column: 1/-1; } .pwc-invite-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 0; } .pwc-invite-row:last-child { border-bottom: 1px solid rgba(255, 255, 255, 0.1); } .pwc-invite-row small { margin-top: 4px; } .pwc-btn.is-added { border: 0; color: #4ade80; background: transparent; } .pwc-crew-page > header { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 12px 0 20px; } .pwc-crew-page > header p { color: $text-secondary; } .pwc-crew-page > header > div:last-child { display: flex; align-items: center; gap: 16px; } .pwc-crew-grid { display: grid; grid-template-columns: 1.18fr 0.92fr; gap: 16px; } .pwc-crew-grid > main, .pwc-crew-grid > aside { padding: 20px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 14px; background: rgba(18, 18, 26, 0.68); } .pwc-crew-grid h2 { margin-bottom: 14px; } .pwc-crew-grid main > h2:not(:first-child) { margin-top: 22px; } .pwc-race-card { padding: 18px; border: 1px solid rgba(34, 197, 94, 0.65); border-radius: 14px; background: rgba(34, 197, 94, 0.05); } .pwc-race-card > header { display: flex; align-items: center; gap: 14px; } .pwc-race-card h3 { font-size: 20px; } .pwc-race-stats { display: grid; grid-template-columns: repeat(4, 1fr); margin: 14px 0; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; } .pwc-race-stats div { padding: 14px; text-align: center; border-right: 1px solid rgba(255, 255, 255, 0.1); } .pwc-race-stats div:last-child { border: 0; } .pwc-race-stats b { display: block; font-size: 23px; } .pwc-race-stats small { margin-top: 5px; } .pwc-race-people p { display: grid; grid-template-columns: 32px 1fr 0.7fr auto; align-items: center; gap: 12px; margin: 0; padding: 10px 12px; border-top: 1px solid rgba(255, 255, 255, 0.1); } .pwc-race-people small { text-transform: uppercase; color: #4ade80; font-size: 11px; font-weight: 700; } .pwc-recent { display: grid; grid-template-columns: 1fr 1fr 2fr auto; align-items: center; gap: 12px; padding: 13px 14px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; } .pwc-filters { display: flex; gap: 8px; margin-bottom: 14px; } .pwc-filters button { padding: 9px 14px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 7px; background: rgba(255, 255, 255, 0.025); color: $text-secondary; } .pwc-filters button.active { color: #fff; border-color: rgba(255, 255, 255, 0.3); } .pwc-roster-row { display: grid; grid-template-columns: 18px 1fr 1.2fr auto; align-items: center; gap: 12px; min-height: 58px; padding: 8px 10px; border-top: 1px solid rgba(255, 255, 255, 0.09); } .pwc-roster-row > span { width: 14px; height: 14px; border: 2px solid $text-muted; border-radius: 50%; } .pwc-roster-row > span.online { border-color: #4ade80; } .pwc-roster-row > span.waiting { border-color: #fbbf24; } .pwc-roster-row b { display: block; color: #4ade80; font-size: 11px; text-transform: uppercase; } .pwc-roster-row > span.waiting ~ div b { color: #fbbf24; } .pwc-command { display: grid; grid-template-columns: 1.5fr auto auto; align-items: center; gap: 18px; padding: 14px 20px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; background: #101720; } .pwc-command > .pwc-back { grid-column: 1; } .pwc-command > div:nth-child(2) { grid-column: 1; } .pwc-command h1 { font-size: 22px; } .pwc-command p { margin: 5px 0 0; color: $text-secondary; } .pwc-command__stats { grid-column: 2; grid-row: 1/3; display: flex; gap: 10px; } .pwc-command__stats span { display: grid; place-items: center; min-width: 88px; height: 60px; padding: 8px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 9px; } .pwc-command__stats b { display: block; font-size: 21px; font-variant-numeric: tabular-nums; } .pwc-command__stats small { text-transform: uppercase; font-size: 10px; } .pwc-online { grid-column: 3; grid-row: 1/3; text-align: right; } .pwc-online b { display: block; color: #4ade80; text-transform: uppercase; } .pwc-online small { margin-top: 7px; } .pwc-wall { display: grid; grid-template-columns: 0.7fr 1.3fr auto; align-items: end; gap: 18px; margin: 10px 0; padding: 12px 18px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; background: #101720; } .pwc-wall > div > small { text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; } .pwc-wall p { display: flex; align-items: center; gap: 10px; margin: 6px 0 0; } .pwc-wall .pwc-avatar { width: 36px; height: 36px; } .pwc-wall b small { margin-top: 3px; font-family: $font-primary; font-weight: 400; } .pwc-live-grid { display: grid; grid-template-columns: minmax(0, 0.92fr) minmax(620px, 1.08fr); gap: 12px; } .pwc-race-view, .pwc-pit { border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; background: #101720; overflow: hidden; } .pwc-race-view > header, .pwc-pit > header { padding: 12px 14px; } .pwc-race-view nav { display: flex; gap: 18px; margin-top: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); } .pwc-race-view nav button { padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: $text-secondary; text-transform: uppercase; font-size: 12px; font-weight: 700; } .pwc-race-view nav button.active { border-bottom-color: $racing-orange; color: #fff; } .pwc-timing, .pwc-sectors { width: calc(100% - 28px); margin: 0 14px 14px; border-collapse: collapse; } .pwc-timing th, .pwc-timing td, .pwc-sectors th, .pwc-sectors td { height: 40px; padding: 0 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-align: left; font-variant-numeric: tabular-nums; } .pwc-timing th, .pwc-sectors th { color: $text-secondary; font-size: 11px; text-transform: uppercase; } .pwc-timing tr.is-me { color: $racing-gold; } .pwc-sectors td:not(:first-child) { color: #4ade80; } .pwc-sectors td.purple { color: #c084fc; } .pwc-track { display: grid; grid-template-columns: 150px 1fr; min-height: 240px; padding: 8px 16px; } .pwc-track__labels p { display: grid; grid-template-columns: 42px 1fr; margin: 9px 0; text-transform: uppercase; font-size: 11px; color: $text-secondary; } .pwc-track__labels b { grid-row: 1/3; display: grid; place-items: center; width: 36px; height: 36px; border: 2px solid; border-radius: 50%; font-size: 13px; } .pwc-track__labels small { color: #fff; } .pwc-track__labels p.is-me { color: $racing-gold; } .pwc-track svg { width: 100%; height: 210px; } .pwc-track path { fill: none; stroke: #ff3918; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; } .pwc-track circle { fill: $racing-gold; stroke: #0a0d13; stroke-width: 4; } .pwc-track text { fill: #111; font-size: 12px; font-weight: 800; } .pwc-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 12px 12px; } .pwc-metrics div { display: grid; gap: 8px; place-items: center; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; } .pwc-metrics small { text-transform: uppercase; font-size: 10px; } .pwc-metrics b { font-size: 23px; } .pwc-metrics em { color: #4ade80; font-style: normal; font-size: 12px; } .pwc-pit > header p { margin: 4px 0 0; color: $text-secondary; } .pwc-pit-head, .pwc-pit-row { display: grid; grid-template-columns: 1fr 1.25fr 0.8fr; align-items: center; min-height: 34px; padding: 0 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); } .pwc-pit-head { min-height: 38px; color: $text-secondary; font-size: 11px; text-transform: uppercase; } .pwc-pit-row { font-size: 12px; } .pwc-pit-row.is-sub > span { padding-left: 18px; } .pwc-pit-row > select, .pwc-pit-row > label { width: 100%; height: 26px; padding: 0 8px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 5px; background: #0b1119; color: #fff; } .pwc-pit-row > label { display: flex; align-items: center; gap: 8px; } .pwc-pit-row > b:last-child { text-align: center; } .pwc-step { display: grid; grid-template-columns: 34px 1fr 34px; height: 26px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 5px; overflow: hidden; } .pwc-step button { border: 0; background: rgba(255, 255, 255, 0.05); color: #fff; } .pwc-step b { display: grid; place-items: center; border-inline: 1px solid rgba(255, 255, 255, 0.08); font-variant-numeric: tabular-nums; } .pwc-send { width: calc(100% - 28px); min-height: 42px; margin: 10px 14px 12px; border: 0; border-radius: 7px; color: #fff; text-transform: uppercase; font-weight: 800; cursor: pointer; } .pwc-stint { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 10px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; background: #101720; text-align: center; text-transform: uppercase; color: $text-secondary; font-size: 11px; } .pwc-stint b { display: block; margin-top: 5px; color: #fff; font-size: 17px; } .pwc-modal-backdrop { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.68); padding: 20px; } .pwc-guest { position: relative; width: min(460px, 100%); padding: 22px; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; background: #111923; box-shadow: 0 28px 90px rgba(0, 0, 0, 0.7); } .pwc-close { position: absolute; top: 12px; right: 14px; border: 0; background: none; color: $text-secondary; font-size: 28px; } .pwc-guest > p { color: $text-secondary; } .pwc-guest > article { display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); } .pwc-guest .pwc-avatar { width: 42px; height: 42px; } .pwc-guest__selected { display: flex; align-items: center; gap: 12px; margin: 24px 0 12px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 9px; } .pwc-guest__selected small { margin-top: 4px; font-family: $font-primary; } .pwc-guest .pwc-send { width: 100%; margin: 0; } @media (max-width: 1180px) { .pwc-home, .pwc-crew-grid, .pwc-live-grid { grid-template-columns: 1fr; } .pwc-crews { min-height: auto; } .pwc-driver-card { grid-template-columns: 12px 52px 1fr 1fr auto; } .pwc-driver-card > div:nth-of-type(3), .pwc-driver-card > div:nth-of-type(4) { display: none; } .pwc-live-grid { grid-template-columns: 1fr; } .pwc-pit { min-width: 0; } .pwc-flow-card.is-wide { grid-template-columns: 1fr; } .pwc-flow-card.is-wide footer { grid-column: 1; } } @media (max-width: 760px) { .pwc { padding: 18px 12px 32px; } .pwc-driver-card { grid-template-columns: 10px 46px 1fr auto; padding: 16px; gap: 10px; } .pwc-driver-card > div:nth-of-type(2) { display: none; } .pwc-person-row { grid-template-columns: 46px 1fr auto; } .pwc-person-row > .pwc-state { display: none; } .pwc-crews { padding: 18px; } .pwc-flow-card { padding: 20px; } .pwc-steps button { min-width: 0; flex: 1; } .pwc-crew-page > header, .pwc-crew-page > header > div:last-child { align-items: flex-start; flex-direction: column; } .pwc-race-stats { grid-template-columns: repeat(2, 1fr); } .pwc-wall { grid-template-columns: 1fr; } .pwc-command { grid-template-columns: 1fr; } .pwc-command__stats, .pwc-online { grid-column: 1; grid-row: auto; } .pwc-command__stats span { min-width: 0; flex: 1; } .pwc-live-grid { display: block; } .pwc-pit { margin-top: 12px; overflow-x: auto; } .pwc-pit-head, .pwc-pit-row { min-width: 620px; } .pwc-stint { grid-template-columns: 1fr; gap: 12px; } .pwc-metrics { grid-template-columns: 1fr; } .pwc-track { grid-template-columns: 1fr; } .pwc-guest__selected { margin-top: 80px; } } @media (prefers-reduced-motion: reduce) { .pwc * { scroll-behavior: auto !important; transition: none !important; } }
/* Visual rhythm pass: more air, fewer equally weighted boxes, racing cues from structure. */
.pwc {
  --pwc-line: rgba(255, 255, 255, 0.085);
  --pwc-line-soft: rgba(255, 255, 255, 0.055);
  --pwc-surface: rgba(15, 20, 29, 0.82);
  --pwc-surface-raised: rgba(19, 25, 35, 0.92);
  padding: 28px clamp(28px, 3.6vw, 58px) 46px;
  background-color: #090c12;
  background-image:
    radial-gradient(circle at 78% 8%, rgba(225, 6, 0, 0.055), transparent 28%),
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: auto, 48px 48px, 48px 48px;
}

.pwc-home,
.pwc-flow,
.pwc-crew-page,
.pwc-live { max-width: 1480px; }

.pwc-home {
  grid-template-columns: minmax(0, 1.82fr) minmax(360px, 0.82fr);
  gap: clamp(28px, 3vw, 44px);
}

.pwc-title-row { padding-top: 5px; }
.pwc-search { width: min(100%, 720px); margin-top: 22px; }
.pwc-search:focus-within { border-color: rgba(255, 107, 0, 0.8); box-shadow: 0 0 0 1px rgba(255, 107, 0, 0.18); }
.pwc-section-title { margin: 32px 0 16px; }
.pwc-driver-list { gap: 16px; }

.pwc-driver-card {
  position: relative;
  min-height: 116px;
  padding: 20px 24px;
  border-color: var(--pwc-line);
  background: var(--pwc-surface);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

.pwc-driver-card::before {
  position: absolute;
  inset: 18px auto 18px 0;
  width: 2px;
  background: #36c86b;
  content: "";
}

.pwc-driver-card.is-crew,
.pwc-driver-card.is-guest { background: linear-gradient(90deg, rgba(255, 255, 255, 0.025), var(--pwc-surface) 22%); }
.pwc-driver-card.is-guest::before { background: #8b5cf6; }

.pwc-crews {
  padding: 24px;
  border-color: var(--pwc-line);
  background: linear-gradient(180deg, rgba(23, 25, 34, 0.8), rgba(14, 18, 26, 0.74));
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.18);
}

.pwc-crews > header { margin-bottom: 20px; }
.pwc-crew-card { margin-bottom: 14px; padding: 19px 16px; border-color: var(--pwc-line-soft); background: rgba(255, 255, 255, 0.018); }
.pwc-crew-card.is-green { background: rgba(34, 197, 94, 0.035); }
.pwc-crew-card.is-violet { background: rgba(139, 92, 246, 0.035); }

.pwc-flow > h1 { margin: 14px 0 24px; }
.pwc-steps { margin-bottom: 28px; }
.pwc-flow-card { gap: 24px; padding: 32px; border-color: var(--pwc-line); background: var(--pwc-surface-raised); box-shadow: 0 22px 56px rgba(0, 0, 0, 0.22); }

.pwc-crew-page > header { margin: 18px 0 28px; }
.pwc-crew-grid { grid-template-columns: minmax(0, 1.2fr) minmax(380px, 0.8fr); gap: 28px; }
.pwc-crew-grid > main,
.pwc-crew-grid > aside { padding: 24px; border-color: var(--pwc-line); background: var(--pwc-surface); box-shadow: 0 18px 44px rgba(0, 0, 0, 0.16); }
.pwc-race-card { padding: 22px; border-color: rgba(34, 197, 94, 0.38); background: rgba(34, 197, 94, 0.035); }
.pwc-race-stats { margin: 20px 0; border-inline: 0; border-radius: 0; }
.pwc-race-stats div { padding: 17px 14px; }
.pwc-roster-row { min-height: 62px; padding-inline: 12px; }

.pwc-command {
  position: relative;
  padding: 17px 22px;
  border-color: var(--pwc-line);
  background: linear-gradient(110deg, rgba(19, 26, 37, 0.98), rgba(13, 18, 26, 0.92));
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.pwc-command::before {
  position: absolute;
  top: 0;
  left: 22px;
  width: 112px;
  height: 2px;
  background: linear-gradient(90deg, #e10600, #ff6b00);
  content: "";
}

.pwc-wall { margin: 14px 0 18px; padding: 14px 20px; border-color: var(--pwc-line); background: rgba(15, 21, 30, 0.74); }
.pwc-live-grid { grid-template-columns: minmax(0, 0.94fr) minmax(600px, 1.06fr); gap: 20px; }
.pwc-race-view,
.pwc-pit { border-color: var(--pwc-line); background: var(--pwc-surface); box-shadow: 0 18px 44px rgba(0, 0, 0, 0.16); }
.pwc-race-view > header,
.pwc-pit > header { padding: 16px 18px; }
.pwc-timing,
.pwc-sectors { width: calc(100% - 36px); margin-inline: 18px; margin-bottom: 18px; }
.pwc-timing th,
.pwc-timing td,
.pwc-sectors th,
.pwc-sectors td { height: 43px; }

.pwc-metrics { gap: 0; margin: 0 18px 18px; padding: 0; border-block: 1px solid var(--pwc-line-soft); }
.pwc-metrics div { min-height: 98px; padding: 16px; border: 0; border-right: 1px solid var(--pwc-line-soft); border-radius: 0; }
.pwc-metrics div:last-child { border-right: 0; }
.pwc-metrics b,
.pwc-race-stats b,
.pwc-command__stats b,
.pwc-pit-row b,
.pwc-stint b { font-variant-numeric: tabular-nums; letter-spacing: -0.015em; }

.pwc-pit-head,
.pwc-pit-row { min-height: 36px; padding-inline: 16px; border-top-color: var(--pwc-line-soft); }
.pwc-pit-head { min-height: 42px; }
.pwc-pit-row > select,
.pwc-pit-row > label,
.pwc-step { height: 28px; }
.pwc-send { margin: 14px 16px 16px; width: calc(100% - 32px); box-shadow: 0 10px 22px rgba(225, 6, 0, 0.14); }

.pwc-stint { margin-top: 16px; padding: 14px 0; border-inline: 0; border-radius: 0; background: transparent; }
.pwc-stint span { border-right: 1px solid var(--pwc-line-soft); }
.pwc-stint span:last-child { border-right: 0; }

.pwc-btn.is-primary,
.pwc-send { box-shadow: 0 8px 20px rgba(225, 6, 0, 0.14); }

/* Home: directory, Crew e Recenti sono tre responsabilità leggibili a colpo d'occhio. */
.pwc-home {
  grid-template-columns: minmax(0, 1.65fr) minmax(380px, 0.78fr);
  gap: clamp(34px, 4vw, 64px);
  padding-top: clamp(24px, 4vh, 52px);
}

.pwc-home__main { min-width: 0; }
.pwc-home-sidebar { align-self: start; }
.pwc-eyebrow {
  display: block;
  margin-bottom: 7px;
  color: $racing-orange;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.pwc-find-panel {
  position: relative;
  width: min(100%, 820px);
  min-height: 0;
  padding: clamp(22px, 2.5vw, 34px);
  border: 1px solid var(--pwc-line);
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(18, 24, 34, 0.9), rgba(11, 15, 22, 0.72));
  box-shadow: 0 22px 58px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.pwc-find-panel::before {
  position: absolute;
  top: 0;
  left: 42px;
  width: 118px;
  height: 2px;
  background: linear-gradient(90deg, #e10600, #ff6b00);
  content: "";
}

.pwc-find-panel > header h2 { font-size: clamp(22px, 2vw, 28px); }

.pwc-find-form {
  margin-top: 18px;
}

.pwc-find-form .pwc-search {
  width: 100%;
  margin: 0;
}

.pwc-search-submit { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; }
.pwc-search-submit svg { width: 21px; height: 21px; }
.pwc-search input:focus-visible { outline: none; box-shadow: none; }
.pwc-search-outcome { display: grid; gap: 10px; margin-top: 18px; }
.pwc-search-person {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 70px;
  padding: 10px 14px;
  border: 1px solid var(--pwc-line);
  border-left: 2px solid #8b5cf6;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
}

.pwc-search-person .pwc-avatar { width: 42px; height: 42px; font-size: 13px; }
.pwc-person-copy { min-width: 0; }
.pwc-person-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pwc-search-person strong { font-size: 16px; }
.pwc-person-copy small {
  display: block;
  margin-top: 3px;
  color: $text-muted;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.025em;
}
.pwc-access-request { position: relative; }
.pwc-search-person .pwc-btn { min-height: 38px; padding: 8px 14px; font-size: 13px; }

.pwc-search-empty {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 90px;
  padding: 18px;
  border: 1px dashed rgba(255, 255, 255, 0.13);
  border-radius: 12px;
}

.pwc-search-empty > span {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--pwc-line);
  border-radius: 50%;
  color: $text-muted;
  font-weight: 800;
}

.pwc-search-empty small { margin-top: 5px; }
.pwc-home-sidebar {
  border: 1px solid var(--pwc-line);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(22, 24, 33, 0.86), rgba(13, 17, 24, 0.74));
  box-shadow: 0 20px 52px rgba(0, 0, 0, 0.2);
}

.pwc-crews {
  padding: 26px 24px 24px;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
}

.pwc-crews > header,
.pwc-recents > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.pwc-crews h2,
.pwc-recents h2 { font-size: 22px; }
.pwc-crew-disclosure {
  margin-bottom: 12px;
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.018);
  overflow: hidden;
}

.pwc-crew-disclosure:last-child { margin-bottom: 0; }
.pwc-crew-disclosure.is-green {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.035);
}
.pwc-crew-disclosure.is-violet {
  border-color: rgba(139, 92, 246, 0.35);
  background: rgba(139, 92, 246, 0.035);
}
.pwc-crew-card {
  width: 100%;
  grid-template-columns: 82px minmax(0, 1fr) 18px;
  margin: 0;
  padding: 15px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #fff;
  text-align: left;
  cursor: pointer;
}

.pwc-crew-card > span { min-width: 0; }
.pwc-crew-chevron {
  display: block;
  width: 18px;
  height: 18px;
  color: $text-muted;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform-origin: center;
  transition: transform 0.15s ease, color 0.15s ease;
}

.pwc-crew-card:hover { background: rgba(255, 255, 255, 0.035); }
.pwc-crew-card[aria-expanded="true"] .pwc-crew-chevron {
  color: $racing-orange;
  transform: rotate(90deg);
}
.pwc-crew-image {
  width: 82px;
  height: 54px;
  border: 1px solid var(--pwc-line);
  border-radius: 8px;
  object-fit: cover;
}

.pwc-crew-members {
  padding: 0 14px 12px;
  border-top: 1px solid var(--pwc-line-soft);
}

.pwc-crew-member-list {
  max-height: 264px;
  overflow-y: auto;
}

.pwc-crew-member {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 7px 0;
  border-bottom: 1px solid var(--pwc-line-soft);
}

.pwc-crew-member .pwc-avatar { width: 34px; height: 34px; font-size: 11px; }
.pwc-crew-member > strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.pwc-crew-member .pwc-btn { min-height: 32px; padding: 6px 10px; font-size: 11px; }
.pwc-open-crew {
  width: 100%;
  padding: 11px 2px 0;
  border: 0;
  background: transparent;
  color: $racing-orange;
  text-align: right;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.pwc-open-crew:hover { color: #fff; }

.pwc-recents {
  position: relative;
  padding: 20px 24px 22px;
  border-top: 1px solid var(--pwc-line-soft);
}

.pwc-recents > header {
  display: block;
}
.pwc-recent-person {
  position: relative;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 8px 4px;
}

.pwc-recent-person .pwc-avatar { width: 38px; height: 38px; font-size: 12px; }
.pwc-recent-person .pwc-person-copy strong { font-size: 14px; }
.pwc-recent-person .pwc-person-copy small { font-size: 10px; }
.pwc-recent-person .pwc-btn { min-height: 34px; padding-inline: 12px; font-size: 12px; }
.pwc-request-menu {
  position: absolute;
  z-index: 3;
  top: calc(100% + 6px);
  right: 0;
  width: 150px;
  padding: 6px;
  border: 1px solid var(--pwc-line);
  border-radius: 9px;
  background: #121923;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.38);
}

.pwc-request-menu button {
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
}

.pwc-request-menu button:hover { background: rgba(255, 107, 0, 0.1); }
.pwc-request-menu button:focus-visible {
  outline: 2px solid #ff6b00;
  outline-offset: -2px;
}

.pwc-image-picker { margin: 0; padding: 0; border: 0; }
.pwc-image-picker legend { font-weight: 600; }
.pwc-image-picker > p { margin: 5px 0 12px; color: $text-secondary; font-size: 13px; }
.pwc-image-picker > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pwc-image-picker button {
  position: relative;
  padding: 0;
  border: 1px solid var(--pwc-line);
  border-radius: 10px;
  background: #0b1017;
  color: #fff;
  overflow: hidden;
  cursor: pointer;
}
.pwc-image-picker button.active { border-color: $racing-orange; box-shadow: 0 0 0 1px rgba(255, 107, 0, 0.35); }
.pwc-image-picker img { display: block; width: 100%; height: 82px; object-fit: cover; }
.pwc-image-picker span { display: block; padding: 8px 10px; text-align: left; font-size: 12px; font-weight: 700; }
.pwc-crew-page__image { width: 112px; height: 72px; border: 1px solid var(--pwc-line); border-radius: 10px; object-fit: cover; }

@media (max-width: 760px) {
  .pwc-home { padding-top: 8px; }
  .pwc-find-panel { min-height: 0; padding: 24px 18px; }
  .pwc-find-panel::before { left: 18px; }
  .pwc-find-form { grid-template-columns: 1fr; }
  .pwc-find-form > .pwc-btn { width: 100%; }
  .pwc-search-person { grid-template-columns: 44px minmax(0, 1fr); }
  .pwc-search-person > .pwc-btn,
  .pwc-search-person > .pwc-access-request { grid-column: 1 / -1; }
  .pwc-home-sidebar { border-radius: 14px; }
  .pwc-crews,
  .pwc-recents { padding: 20px 16px; }
  .pwc-crew-card { grid-template-columns: 68px minmax(0, 1fr) auto; padding: 14px; }
  .pwc-crew-members { padding-inline: 12px; }
  .pwc-crew-image { width: 68px; height: 48px; }
  .pwc-recent-person { grid-template-columns: 38px minmax(0, 1fr) auto; }
  .pwc-image-picker > div { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 1181px) and (max-height: 950px) {
  .pwc { padding-top: 12px; padding-bottom: 30px; }
  .pwc-command { position: relative; gap: 10px; min-height: 64px; padding: 6px 18px; }
  .pwc-command > .pwc-back { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); }
  .pwc-command > div:nth-child(2) { grid-row: 1; }
  .pwc-command h1 { font-size: 19px; }
  .pwc-command p { margin-top: 2px; }
  .pwc-command__stats span { min-width: 76px; height: 48px; padding: 5px; }
  .pwc-command__stats b { font-size: 18px; }
  .pwc-wall { gap: 12px; margin: 6px 0 10px; padding: 4px 18px; }
  .pwc-wall > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; }
  .pwc-wall p { margin: 0; }
  .pwc-wall .pwc-avatar { width: 26px; height: 26px; }
  .pwc-panel > header { padding-block: 9px; }
  .pwc-pit > header { padding: 7px 14px; }
  .pwc-pit > header p { display: none; }
  .pwc-tabs { min-height: 32px; }
  .pwc-timing th,
  .pwc-timing td,
  .pwc-sectors th,
  .pwc-sectors td { height: 35px; }
  .pwc-pit-head,
  .pwc-pit-row { min-height: 30px; }
  .pwc-pit-head { min-height: 32px; }
  .pwc-pit-row > select,
  .pwc-pit-row > label,
  .pwc-step { height: 24px; }
  .pwc-send { min-height: 38px; margin-block: 8px 10px; }
  .pwc-stint { margin-top: 10px; padding-block: 10px; }
}
</style>
