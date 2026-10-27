<script setup lang="ts">
// Rubrica compatta: amici e richieste hanno gruppi distinti; la ricerca di
// nuove persone occupa lo stesso spazio senza duplicare i campi.
// Gli eventi continuano a essere gestiti dallo store della pagina.
import { computed, ref } from "vue";
import PitwallConceptActionMenu from "~/components/pitwall/concept/PitwallConceptActionMenu.vue";
import ScrollArea from "~/components/ui/ScrollArea.vue";
import PitwallConceptMore from "~/components/pitwall/concept/PitwallConceptMore.vue";
import {
  PITWALL_CONCEPT_LIST_LIMITS,
  filterPitwallConceptPeople,
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
  splitPitwallConceptList,
} from "~/utils/pitwallConcept";
import type { PitwallConceptFriend, PitwallConceptPerson } from "~/utils/pitwallConcept";
import { useI18n } from "~/i18n";

const props = defineProps<{
  /** Gia' nell'ordine di lettura: ricevute, inviate, in pista, il resto. */
  friends: PitwallConceptFriend[];
  people: PitwallConceptPerson[];
  adding?: boolean;
}>();

const emit = defineEmits<{
  /** Accettare una richiesta ricevuta. */
  accept: [personId: string];
  /** Rifiutare, annullare, togliere: la stessa cosa vista da tre lati. */
  remove: [personId: string];
  /** Entrare nel Pitwall aperto di un amico. */
  enter: [raceId: string];
}>();

const { t } = useI18n();

/** Togliere un amico e' l'unico gesto che chiede conferma: e' irreversibile. */
const confirming = ref<string | null>(null);
const filter = ref("");
const tab = ref<"friends" | "requests">("friends");
const expanded = ref(false);

const nick = (id: string) => pitwallConceptNicknameById(id, props.people);
const initials = (id: string) => pitwallConceptInitialsById(id, props.people);

/** Un solo filtro locale, disponibile quando la rubrica contiene persone. */
const showFilter = computed(() => props.friends.length > 0);
const isRequest = (friend: PitwallConceptFriend) => friend.state === "sent" || friend.state === "received";
const requests = computed(() => props.friends.filter(isRequest));

const filtered = computed(() => {
  const needle = filter.value.trim();
  const entries = props.friends.filter(friend => tab.value === "requests" ? isRequest(friend) : !isRequest(friend));
  if (!needle) return entries;
  const allowed = new Set(filterPitwallConceptPeople(needle, props.people).map(person => person.id));
  return entries.filter(friend => allowed.has(friend.personId));
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
  return t("pitwallConcept.friends.removeWarning", { name: nick(personId) });
}
</script>

<template>
  <section class="pwc-side">
    <header class="pwc-block__head">
      <h2 class="pwc-block__title">
        {{ t('pitwallConcept.friends.title') }}
        <span class="pwc-count">{{ friends.length - requests.length }}</span>
      </h2>
      <slot name="heading-action" />
    </header>
    <slot v-if="adding" name="search" />
    <template v-else>
    <div class="pwc-social-tabs" :aria-label="t('pitwallConcept.friends.tabsAria')">
      <button type="button" :aria-pressed="tab === 'friends'" @click="tab = 'friends'; expanded = false">{{ t('pitwallConcept.friends.tabFriends') }}</button>
      <button type="button" :aria-pressed="tab === 'requests'" @click="tab = 'requests'; expanded = false">
        {{ t('pitwallConcept.friends.tabRequests') }} <span v-if="requests.length">{{ requests.length }}</span>
        <span v-if="waiting" class="sr-only">, {{ t('pitwallConcept.friends.received', { count: waiting }) }}</span>
      </button>
    </div>

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
        :placeholder="t('pitwallConcept.friends.filter')"
        :aria-label="t('pitwallConcept.friends.filter')"
      >
      <button
        v-if="filter"
        type="button"
        :aria-label="t('pitwallConcept.friends.clearFilter')"
        @click="filter = ''"
      >
        ×
      </button>
    </label>

    <ScrollArea class="pwc-social-scroll" :key="tab" :label="tab === 'friends' ? t('pitwallConcept.friends.listFriends') : t('pitwallConcept.friends.listRequests')">
    <ul
      v-if="split.visible.length"
      class="pwc-people"
    >
      <li
        v-for="friend in split.visible"
        :key="friend.personId"
        class="pwc-person"
        :class="{ 'is-deciding': friend.state === 'received', 'is-friend': !isRequest(friend) }"
      >
        <span class="pwc-avatar">{{ initials(friend.personId) }}</span>
        <div class="pwc-person__heading">
          <strong class="pwc-person__name" :title="nick(friend.personId)">{{ nick(friend.personId) }}</strong>
          <span v-if="!isRequest(friend)" class="pwc-person__status" role="status">
            <span v-if="friend.pitwallOpen">{{ t('pitwallConcept.friends.pitwallOpen') }}</span>
          </span>
          <PitwallConceptActionMenu
            v-if="!isRequest(friend)"
            :label="t('pitwallConcept.friends.options', { name: nick(friend.personId) })"
            :action-label="t('pitwallConcept.friends.removeFriend')"
            :primary-label="friend.pitwallOpen && friend.raceId ? t('pitwallConcept.friends.enterPitwall') : undefined"
            @primary="friend.raceId && emit('enter', friend.raceId)"
            @select="askRemove(friend.personId)"
          />
        </div>

        <span
          v-if="friend.state === 'received'"
          class="pwc-chip is-asking"
        >{{ t('pitwallConcept.friends.asked') }}</span>
        <span
          v-else-if="friend.state === 'sent'"
          class="pwc-chip is-waiting"
        >{{ t('pitwallConcept.friends.waiting') }}</span>

        <span v-if="isRequest(friend)" class="pwc-person__actions">
          <template v-if="friend.state === 'received'">
            <button
              type="button"
              class="rc-btn rc-btn--compact rc-btn--primary"
              @click="emit('accept', friend.personId)"
            >
              {{ t('pitwallConcept.friends.accept') }}
            </button>
            <button
              type="button"
              class="pwc-link-btn"
              @click="emit('remove', friend.personId)"
            >
              {{ t('pitwallConcept.friends.reject') }}
            </button>
          </template>
          <button
            v-else-if="friend.state === 'sent'"
            type="button"
            class="pwc-link-btn"
            :aria-label="t('pitwallConcept.friends.cancelAria', { name: nick(friend.personId) })"
            @click="emit('remove', friend.personId)"
          >
            {{ t('pitwallConcept.friends.cancel') }}
          </button>

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
              {{ t('pitwallConcept.friends.cancel') }}
            </button>
            <button
              type="button"
              class="rc-btn rc-btn--compact rc-btn--danger"
              @click="confirmRemove(friend.personId)"
            >
              {{ t('pitwallConcept.friends.remove') }}
            </button>
          </span>
        </div>
      </li>
    </ul>

    <p
      v-else-if="filter"
      class="pwc-empty"
    >
      {{ t('pitwallConcept.friends.noResult') }}
    </p>
    <p
      v-else
      class="pwc-empty"
    >
      {{ tab === 'requests' ? t('pitwallConcept.friends.noRequests') : t('pitwallConcept.friends.noFriends') }}
    </p>

    <PitwallConceptMore
      :hidden="split.hidden"
      :expanded="expanded"
      :noun="tab === 'requests' ? t('pitwallConcept.more.requests') : t('pitwallConcept.more.friends')"
      :noun-one="tab === 'requests' ? t('pitwallConcept.more.request') : t('pitwallConcept.more.friend')"
      @toggle="expanded = !expanded"
    />
    </ScrollArea>
    </template>
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

.pwc-person__heading { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pwc-person__heading .pwc-person__name { flex: 1; min-width: 0; }
.pwc .pwc-person.is-friend { grid-template-rows: 34px; row-gap: 0; }
.pwc-person__status { flex: 0 0 auto; color: #4ade80; font-size: 10px; line-height: 18px; white-space: nowrap; }
.pwc-person__status:empty { display: none; }
.pwc-person.is-friend .pwc-person__heading { gap: 8px; }
.pwc-person.is-friend .pwc-person__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pwc-person.is-friend .pwc-confirm { grid-column: 1 / -1; }
</style>
