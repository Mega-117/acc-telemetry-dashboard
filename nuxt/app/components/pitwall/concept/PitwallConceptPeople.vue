<script setup lang="ts">
// Le mie persone, in un verso o nell'altro (PIP-369).
//
// Quattro stati e basta: Sempre, Fino alle 23:40, In attesa, Ti ha chiesto. Gli
// ultimi due sono la stessa richiesta vista dai due lati, e stanno qui invece
// che in una terza lista perche' la decisione deve trovarsi dove si sta gia'
// guardando: chi non apre la campanella la trova comunque.
import { ref } from "vue";
import PitwallConceptExpiry from "~/components/pitwall/concept/PitwallConceptExpiry.vue";
import {
  PITWALL_CONCEPT_DEFAULT_EXPIRY,
  describePitwallConceptAccess,
  normalizePitwallConceptExpiry,
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
} from "~/utils/pitwallConcept";
import type { PitwallConceptDirection, PitwallConceptLink } from "~/utils/pitwallConcept";

const props = defineProps<{
  direction: PitwallConceptDirection;
  links: PitwallConceptLink[];
  racingIds: string[];
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
  const who = pitwallConceptNicknameById(personId);
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
  <ul
    v-if="links.length"
    class="pwc-people"
  >
    <li
      v-for="link in links"
      :key="link.personId"
      class="pwc-person"
    >
      <span class="pwc-avatar">{{ pitwallConceptInitialsById(link.personId) }}</span>
      <strong class="pwc-person__name">
        {{ pitwallConceptNicknameById(link.personId) }}
        <span
          v-if="racingIds.includes(link.personId)"
          class="pwc-live-dot"
        >in gara adesso</span>
      </strong>

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
          :aria-label="`Annulla la richiesta a ${pitwallConceptNicknameById(link.personId)}`"
          @click="emit('cancel', link.personId)"
        >
          Annulla
        </button>
        <button
          v-else
          type="button"
          class="pwc-link-btn"
          :aria-label="`Rimuovi ${pitwallConceptNicknameById(link.personId)}`"
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
    v-else
    class="pwc-empty"
  >
    Nessuna persona in questo elenco.
  </p>
</template>
