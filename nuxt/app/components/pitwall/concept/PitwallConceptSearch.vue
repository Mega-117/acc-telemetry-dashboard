<script setup lang="ts">
// Una sola ricerca per tutto il prototipo (PIP-369): la home la usa per
// aggiungere una persona, la gara per invitare qualcuno. Il campo e gli stati
// stanno qui; i bottoni li decide chi la monta, perche' l'azione cambia col
// posto ma la ricerca no.
//
// Il vuoto non e' uno solo, ed e' il difetto che questo componente chiude:
// "non ho ancora scritto abbastanza", "non esiste nessuno con questo nome" e
// "esiste, ma ce l'hai gia'" sono tre risposte diverse. Prima erano una sola
// frase, e chi cercava una persona gia' collegata concludeva che non fosse
// iscritta.
import ScrollArea from "~/components/ui/ScrollArea.vue";
import { pitwallConceptInitials, pitwallConceptNickname } from "~/utils/pitwallConcept";
import type { PitwallConceptSearchResult } from "~/utils/pitwallConcept";
import { computed } from "vue";
import { useI18n } from "~/i18n";

const props = defineProps<{
  found: PitwallConceptSearchResult;
  placeholder?: string;
  /** Come si chiama qui chi e' gia' in un elenco. */
  linkedLabel?: string;
  emptyLabel?: string;
}>();
const { t } = useI18n();
const placeholderText = computed(() => props.placeholder ?? t("pitwallConcept.search.placeholder"));
const linkedText = computed(() => props.linkedLabel ?? t("pitwallConcept.search.linked"));
const emptyText = computed(() => props.emptyLabel ?? t("pitwallConcept.search.empty"));

const query = defineModel<string>({ required: true });
</script>

<template>
  <div class="pwc-find">
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
        v-model="query"
        :placeholder="placeholderText"
        :aria-label="placeholderText"
      >
      <button
        v-if="query"
        type="button"
        :aria-label="t('pitwallConcept.search.clear')"
        @click="query = ''"
      >
        ×
      </button>
    </label>

    <ScrollArea class="pwc-find__results" :label="t('pitwallConcept.search.resultsAria')">
    <p
      v-if="found.state === 'too-short'"
      class="pwc-empty"
    >
      {{ t('pitwallConcept.search.tooShort') }}
    </p>

    <ul
      v-if="found.entries.length"
      class="pwc-people"
    >
      <li
        v-for="person in found.entries"
        :key="person.id"
        class="pwc-person is-add"
      >
        <span class="pwc-avatar">{{ pitwallConceptInitials(person) }}</span>
        <strong class="pwc-person__name">{{ pitwallConceptNickname(person) }}</strong>
        <span class="pwc-person__actions">
          <slot
            name="actions"
            :person="person"
          ></slot>
        </span>
        <slot
          name="after"
          :person="person"
        ></slot>
      </li>
    </ul>

    <!-- Il taglio si dichiara invece di avvenire in silenzio: qui non si
         sfoglia una rubrica, si scrive una lettera in piu'. -->
    <p
      v-if="found.state === 'capped'"
      class="pwc-empty"
    >
      {{ t('pitwallConcept.search.capped', { count: found.hidden }) }}
    </p>

    <p
      v-if="found.state === 'none' && !found.linked.length"
      class="pwc-empty"
    >
      {{ emptyText }}
    </p>

    <!-- Chi e' gia' in un elenco si mostra spento, non si nasconde: sparire
         sarebbe una risposta sbagliata alla domanda "esiste?". -->
    <ul
      v-if="found.linked.length"
      class="pwc-people pwc-people--linked"
    >
      <li
        v-for="person in found.linked"
        :key="person.id"
        class="pwc-person is-add is-linked"
      >
        <span class="pwc-avatar">{{ pitwallConceptInitials(person) }}</span>
        <strong class="pwc-person__name">{{ pitwallConceptNickname(person) }}</strong>
        <span class="pwc-chip is-waiting">{{ linkedText }}</span>
      </li>
    </ul>
    <p
      v-if="found.linkedHidden"
      class="pwc-empty"
    >
      {{ t('pitwallConcept.search.linkedHidden', { count: found.linkedHidden }) }}
    </p>
    </ScrollArea>
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

.pwc-people--linked { margin-top: 8px; }
.pwc-person.is-linked { opacity: 0.62; }
</style>
