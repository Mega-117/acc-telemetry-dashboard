<script setup lang="ts">
// Le mie persone, in un verso o nell'altro (PIP-369).
//
// Quattro stati e basta: Sempre, Fino alle 23:40, In attesa, Ti ha chiesto. Gli
// ultimi due sono la stessa richiesta vista dai due lati, e stanno qui invece
// che in una terza lista perche' la decisione deve trovarsi dove si sta gia'
// guardando: chi non apre la campanella la trova comunque.
//
// Con cinquanta permessi per verso - il tetto vero del servizio - l'elenco
// piatto e' due metri di scroll. Si mostrano le prime otto righe, **tranne**
// quelle che chiedono una decisione, che non si nascondono mai: nasconderle
// sarebbe lo stesso difetto dello scroll interno che la Classica ha gia' tolto.
import { computed, ref } from "vue";
import PitwallConceptExpiry from "~/components/pitwall/concept/PitwallConceptExpiry.vue";
import PitwallConceptMore from "~/components/pitwall/concept/PitwallConceptMore.vue";
import {
  PITWALL_CONCEPT_DEFAULT_EXPIRY,
  PITWALL_CONCEPT_FILTER_FROM,
  PITWALL_CONCEPT_LIST_LIMITS,
  describePitwallConceptAccess,
  describePitwallConceptEmpty,
  filterPitwallConceptPeople,
  isPitwallConceptPinnedLink,
  normalizePitwallConceptExpiry,
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
  sortPitwallConceptLinks,
  splitPitwallConceptList,
} from "~/utils/pitwallConcept";
import type { PitwallConceptDirection, PitwallConceptLink, PitwallConceptPerson } from "~/utils/pitwallConcept";

const props = defineProps<{
  direction: PitwallConceptDirection;
  links: PitwallConceptLink[];
  people: PitwallConceptPerson[];
  racingIds: string[];
  /** La scadenza si tocca solo sui permessi che si posseggono. */
  canEdit: boolean;
}>();

const emit = defineEmits<{
  remove: [personId: string];
  cancel: [personId: string];
  decide: [personId: string, decision: "always" | "today" | "reject", until?: string];
  expiry: [personId: string, until: string];
}>();

/** Un solo editor aperto alla volta, e si sa sempre a cosa serve. */
const expiry = ref<{ personId: string; mode: "edit" | "accept"; time: string } | null>(null);
/** Togliere una persona e' l'unico gesto che chiede conferma: e' irreversibile. */
const confirming = ref<string | null>(null);
const filter = ref("");
const expanded = ref(false);

const title = computed(() => (
  props.direction === "assist" ? "Posso assistere" : "Possono assistermi"
));

const nick = (id: string) => pitwallConceptNicknameById(id, props.people);
const initials = (id: string) => pitwallConceptInitialsById(id, props.people);

/** Il filtro compare solo quando serve: sotto la decina e' un campo in piu'. */
const showFilter = computed(() => props.links.length >= PITWALL_CONCEPT_FILTER_FROM);

const filtered = computed(() => {
  const sorted = sortPitwallConceptLinks(props.links, props.racingIds, props.people);
  const needle = filter.value.trim();
  if (!needle) return sorted;
  const allowed = new Set(filterPitwallConceptPeople(needle, props.people).map(person => person.id));
  return sorted.filter(link => allowed.has(link.personId));
});

const split = computed(() => splitPitwallConceptList(
  filtered.value,
  expanded.value ? filtered.value.length : PITWALL_CONCEPT_LIST_LIMITS.people,
  isPitwallConceptPinnedLink,
));

/** Quante aspettano una risposta da me: e' il numero che vale la pena vedere. */
const waiting = computed(() => props.links.filter(isPitwallConceptPinnedLink).length);

function openExpiry(personId: string, mode: "edit" | "accept", current?: string) {
  confirming.value = null;
  expiry.value = { personId, mode, time: current ?? PITWALL_CONCEPT_DEFAULT_EXPIRY };
}

function confirmExpiry() {
  const pending = expiry.value;
  if (!pending) return;
  const until = normalizePitwallConceptExpiry(pending.time);
  if (pending.mode === "edit") emit("expiry", pending.personId, until);
  else emit("decide", pending.personId, "today", until);
  expiry.value = null;
}

function askRemove(personId: string) {
  expiry.value = null;
  confirming.value = personId;
}

function confirmRemove(personId: string) {
  confirming.value = null;
  emit("remove", personId);
}

/** L'effetto detto a parole, dalla parte giusta: chi perde cosa. */
function removeWarning(personId: string): string {
  const who = nick(personId);
  return props.direction === "assisted"
    ? `${who} non vedrà più le tue gare e non potrà mandarti strategie.`
    : `Non vedrai più le gare di ${who}.`;
}

function chipClass(link: PitwallConceptLink): string {
  if (link.access === "always") return "is-always";
  if (link.access === "today") return "is-today";
  return link.access === "pending" ? "is-waiting" : "is-asking";
}
</script>

<template>
  <section class="pwc-side">
    <header class="pwc-block__head">
      <h2 class="pwc-block__title">
        {{ title }}
        <span class="pwc-count">{{ links.length }}</span>
      </h2>
      <span
        v-if="waiting"
        class="pwc-chip is-asking"
      >{{ waiting }} da decidere</span>
    </header>

    <label
      v-if="showFilter"
      class="pwc-search is-slim"
    >
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
        v-model="filter"
        :placeholder="`Filtra ${title.toLocaleLowerCase('it-IT')}`"
        :aria-label="`Filtra ${title}`"
      >
      <button
        v-if="filter"
        type="button"
        aria-label="Cancella filtro"
        @click="filter = ''"
      >
        ×
      </button>
    </label>

    <ul
      v-if="split.visible.length"
      class="pwc-people"
    >
      <li
        v-for="link in split.visible"
        :key="link.personId"
        class="pwc-person"
        :class="{ 'is-deciding': link.access === 'incoming' }"
      >
        <span class="pwc-avatar">{{ initials(link.personId) }}</span>
        <strong class="pwc-person__name">
          {{ nick(link.personId) }}
          <span
            v-if="racingIds.includes(link.personId)"
            class="pwc-live-dot"
          >in gara adesso</span>
        </strong>

        <!-- La scadenza e' un bottone solo per chi la possiede: dall'altro
             lato si legge e basta. -->
        <button
          v-if="link.access === 'today' && canEdit"
          type="button"
          class="pwc-chip is-today is-editable"
          :aria-label="`Cambia scadenza di ${nick(link.personId)}`"
          @click="openExpiry(link.personId, 'edit', link.until)"
        >
          {{ describePitwallConceptAccess(link) }}
        </button>
        <span
          v-else
          class="pwc-chip"
          :class="chipClass(link)"
        >
          {{ describePitwallConceptAccess(link) }}
        </span>

        <span class="pwc-person__actions">
          <template v-if="link.access === 'incoming'">
            <button
              type="button"
              class="pwc-btn"
              :class="{ 'is-active': expiry?.personId === link.personId }"
              @click="openExpiry(link.personId, 'accept')"
            >
              Solo per oggi
            </button>
            <button
              type="button"
              class="pwc-btn is-primary"
              @click="emit('decide', link.personId, 'always')"
            >
              Sempre
            </button>
            <button
              type="button"
              class="pwc-link-btn"
              @click="emit('decide', link.personId, 'reject')"
            >
              Rifiuta
            </button>
          </template>
          <button
            v-else-if="link.access === 'pending'"
            type="button"
            class="pwc-link-btn"
            :aria-label="`Annulla la richiesta a ${nick(link.personId)}`"
            @click="emit('cancel', link.personId)"
          >
            Annulla
          </button>
          <button
            v-else
            type="button"
            class="pwc-link-btn"
            :aria-label="`Rimuovi ${nick(link.personId)}`"
            @click="askRemove(link.personId)"
          >
            Rimuovi
          </button>
        </span>

        <div
          v-if="confirming === link.personId"
          class="pwc-confirm"
        >
          <span>{{ removeWarning(link.personId) }}</span>
          <span class="pwc-confirm__actions">
            <button
              type="button"
              class="pwc-link-btn"
              @click="confirming = null"
            >
              Annulla
            </button>
            <button
              type="button"
              class="pwc-btn is-danger"
              @click="confirmRemove(link.personId)"
            >
              Rimuovi
            </button>
          </span>
        </div>

        <PitwallConceptExpiry
          v-if="expiry && expiry.personId === link.personId"
          v-model="expiry.time"
          :confirm-label="expiry.mode === 'edit' ? 'Salva' : 'Autorizza'"
          @confirm="confirmExpiry"
          @cancel="expiry = null"
        />
      </li>
    </ul>

    <p
      v-else-if="filter"
      class="pwc-empty"
    >
      Nessuno con questo nome in questo elenco.
    </p>
    <p
      v-else
      class="pwc-empty"
    >
      {{ describePitwallConceptEmpty(direction) }}
    </p>

    <PitwallConceptMore
      :hidden="split.hidden"
      :expanded="expanded"
      noun="persone"
      noun-one="persona"
      @toggle="expanded = !expanded"
    />
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* Una colonna per verso. Le basi condivise stanno in PitwallConcept.vue. */
.pwc-side { display: grid; align-content: start; }

.pwc-count {
  margin-left: 8px;
  color: $text-muted;
  font-family: $font-primary;
  font-variant-numeric: tabular-nums;
}

/* Il filtro dentro la colonna e' piu' basso della ricerca principale: e' un
   attrezzo di servizio, non l'azione della pagina. */
.pwc-search.is-slim { min-height: 38px; margin-top: 12px; }
.pwc-search.is-slim input { font-size: 14px; }
</style>
