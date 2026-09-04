<script setup lang="ts">
// Gli amici (PIP-362): un elenco solo, e una sola relazione da capire.
//
// Prima c'erano due colonne, una per verso del permesso, con quattro stati
// ciascuna e una scadenza: il modello del database messo a schermo. Qui c'e'
// cio' che l'utente legge davvero: siamo amici, gli ho chiesto, mi ha chiesto.
// Chi aspetta una mia risposta sta in cima e non si nasconde mai dietro il
// limite dell'elenco.
//
// La riga dice anche se l'amico e' in pista e se ha il Pitwall aperto: e' il
// motivo per cui vale la pena guardarlo proprio ora.
import { computed, ref } from "vue";
import PitwallConceptMore from "~/components/pitwall/concept/PitwallConceptMore.vue";
import {
  PITWALL_CONCEPT_FILTER_FROM,
  PITWALL_CONCEPT_LIST_LIMITS,
  filterPitwallConceptPeople,
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
  splitPitwallConceptList,
} from "~/utils/pitwallConcept";
import type { PitwallConceptFriend, PitwallConceptPerson } from "~/utils/pitwallConcept";

const props = defineProps<{
  /** Gia' nell'ordine di lettura: ricevute, inviate, in pista, il resto. */
  friends: PitwallConceptFriend[];
  people: PitwallConceptPerson[];
}>();

const emit = defineEmits<{
  /** Accettare una richiesta ricevuta. */
  accept: [personId: string];
  /** Rifiutare, annullare, togliere: la stessa cosa vista da tre lati. */
  remove: [personId: string];
  /** Entrare nel Pitwall aperto di un amico. */
  enter: [raceId: string];
}>();

/** Togliere un amico e' l'unico gesto che chiede conferma: e' irreversibile. */
const confirming = ref<string | null>(null);
const filter = ref("");
const expanded = ref(false);

const nick = (id: string) => pitwallConceptNicknameById(id, props.people);
const initials = (id: string) => pitwallConceptInitialsById(id, props.people);

/** Il filtro compare solo quando serve: sotto la decina e' un campo in piu'. */
const showFilter = computed(() => props.friends.length >= PITWALL_CONCEPT_FILTER_FROM);

const filtered = computed(() => {
  const needle = filter.value.trim();
  if (!needle) return props.friends;
  const allowed = new Set(filterPitwallConceptPeople(needle, props.people).map(person => person.id));
  return props.friends.filter(friend => allowed.has(friend.personId));
});

/** Una riga che aspetta una mia risposta non si nasconde mai. */
const isPinned = (friend: PitwallConceptFriend) => friend.state === "received";

const split = computed(() => splitPitwallConceptList(
  filtered.value,
  expanded.value ? filtered.value.length : PITWALL_CONCEPT_LIST_LIMITS.people,
  isPinned,
));

/** Quante aspettano una risposta da me: e' il numero che vale la pena vedere. */
const waiting = computed(() => props.friends.filter(isPinned).length);

function askRemove(personId: string) {
  confirming.value = personId;
}

function confirmRemove(personId: string) {
  confirming.value = null;
  emit("remove", personId);
}

/** L'effetto detto a parole, prima di farlo. */
function removeWarning(personId: string): string {
  return `${nick(personId)} non vedrà più il tuo Pitwall, e tu non vedrai il suo.`;
}
</script>

<template>
  <section class="pwc-side">
    <header class="pwc-block__head">
      <h2 class="pwc-block__title">
        Amici
        <span class="pwc-count">{{ friends.length }}</span>
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
        placeholder="Filtra amici"
        aria-label="Filtra amici"
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
        v-for="friend in split.visible"
        :key="friend.personId"
        class="pwc-person"
        :class="{ 'is-deciding': friend.state === 'received' }"
      >
        <span class="pwc-avatar">{{ initials(friend.personId) }}</span>
        <strong class="pwc-person__name">
          {{ nick(friend.personId) }}
          <span
            v-if="friend.racing"
            class="pwc-live-dot"
          >in pista</span>
        </strong>

        <span
          v-if="friend.state === 'received'"
          class="pwc-chip is-asking"
        >Ti ha chiesto</span>
        <span
          v-else-if="friend.state === 'sent'"
          class="pwc-chip is-waiting"
        >In attesa</span>
        <span
          v-else-if="friend.pitwallOpen"
          class="pwc-chip is-always"
        >Pitwall aperto</span>
        <span v-else></span>

        <span class="pwc-person__actions">
          <template v-if="friend.state === 'received'">
            <button
              type="button"
              class="pwc-btn is-primary"
              @click="emit('accept', friend.personId)"
            >
              Accetta
            </button>
            <button
              type="button"
              class="pwc-link-btn"
              @click="emit('remove', friend.personId)"
            >
              Rifiuta
            </button>
          </template>
          <button
            v-else-if="friend.state === 'sent'"
            type="button"
            class="pwc-link-btn"
            :aria-label="`Annulla la richiesta a ${nick(friend.personId)}`"
            @click="emit('remove', friend.personId)"
          >
            Annulla
          </button>
          <template v-else>
            <button
              v-if="friend.pitwallOpen && friend.raceId"
              type="button"
              class="pwc-btn is-primary"
              @click="emit('enter', friend.raceId)"
            >
              Entra
            </button>
            <button
              type="button"
              class="pwc-link-btn"
              :aria-label="`Rimuovi ${nick(friend.personId)}`"
              @click="askRemove(friend.personId)"
            >
              Rimuovi
            </button>
          </template>
        </span>

        <div
          v-if="confirming === friend.personId"
          class="pwc-confirm"
        >
          <span>{{ removeWarning(friend.personId) }}</span>
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
              @click="confirmRemove(friend.personId)"
            >
              Rimuovi
            </button>
          </span>
        </div>
      </li>
    </ul>

    <p
      v-else-if="filter"
      class="pwc-empty"
    >
      Nessun amico con questo nome.
    </p>
    <p
      v-else
      class="pwc-empty"
    >
      Non hai ancora amici. Cerca il nickname di chi vuoi al muretto e aggiungilo:
      quando accetta, vi vedrete i Pitwall a vicenda.
    </p>

    <PitwallConceptMore
      :hidden="split.hidden"
      :expanded="expanded"
      noun="amici"
      noun-one="amico"
      @toggle="expanded = !expanded"
    />
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* Le basi condivise stanno in PitwallConcept.vue: qui solo la colonna. */
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
