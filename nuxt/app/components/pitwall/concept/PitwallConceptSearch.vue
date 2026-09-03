<script setup lang="ts">
// Una sola ricerca per tutto il prototipo (PIP-369): la home la usa per
// aggiungere una persona, la gara per invitare qualcuno. Il campo e i risultati
// stanno qui; i bottoni li decide chi la monta, perche' l'azione cambia col
// posto ma la ricerca no.
import { pitwallConceptInitials, pitwallConceptNickname } from "~/utils/pitwallConcept";
import type { PitwallConceptPerson } from "~/utils/pitwallConcept";

withDefaults(
  defineProps<{
    results: PitwallConceptPerson[];
    placeholder?: string;
    emptyLabel?: string;
  }>(),
  { placeholder: "Cerca nickname", emptyLabel: "Nessuno con questo nickname." },
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
      />
      <button
        v-if="query"
        type="button"
        aria-label="Cancella ricerca"
        @click="query = ''"
      >
        ×
      </button>
    </label>

    <ul
      v-if="query && results.length"
      class="pwc-people"
    >
      <li
        v-for="found in results"
        :key="found.id"
        class="pwc-person is-add"
      >
        <span class="pwc-avatar">{{ pitwallConceptInitials(found) }}</span>
        <strong class="pwc-person__name">{{ pitwallConceptNickname(found) }}</strong>
        <span class="pwc-person__actions">
          <slot
            name="actions"
            :person="found"
          ></slot>
        </span>
        <slot
          name="after"
          :person="found"
        ></slot>
      </li>
    </ul>
    <p
      v-else-if="query"
      class="pwc-empty"
    >
      {{ emptyLabel }}
    </p>
  </div>
</template>
