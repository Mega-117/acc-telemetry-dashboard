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
import { pitwallConceptInitials, pitwallConceptNickname } from "~/utils/pitwallConcept";
import type { PitwallConceptSearchResult } from "~/utils/pitwallConcept";

withDefaults(
  defineProps<{
    found: PitwallConceptSearchResult;
    placeholder?: string;
    /** Come si chiama qui chi e' gia' in un elenco. */
    linkedLabel?: string;
    emptyLabel?: string;
  }>(),
  {
    placeholder: "Cerca nickname",
    linkedLabel: "Ce l'hai già",
    emptyLabel: "Nessuno con questo nickname.",
  },
);

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
        :placeholder="placeholder"
        :aria-label="placeholder"
      >
      <button
        v-if="query"
        type="button"
        aria-label="Cancella ricerca"
        @click="query = ''"
      >
        ×
      </button>
    </label>

    <p
      v-if="found.state === 'too-short'"
      class="pwc-empty"
    >
      Scrivi almeno due lettere.
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
      Altre {{ found.hidden }} persone corrispondono: scrivi qualche lettera in più.
    </p>

    <p
      v-if="found.state === 'none' && !found.linked.length"
      class="pwc-empty"
    >
      {{ emptyLabel }}
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
        <span class="pwc-chip is-waiting">{{ linkedLabel }}</span>
      </li>
    </ul>
    <p
      v-if="found.linkedHidden"
      class="pwc-empty"
    >
      E altre {{ found.linkedHidden }} che hai già.
    </p>
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

.pwc-people--linked { margin-top: 8px; }
.pwc-person.is-linked { opacity: 0.62; }
</style>
