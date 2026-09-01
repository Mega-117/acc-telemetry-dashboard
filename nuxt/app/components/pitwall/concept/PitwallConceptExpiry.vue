<script setup lang="ts">
// Dove si sceglie quando scade un accesso a tempo (PIP-369).
// Vive in un posto solo: lo usa sia chi concede l'accesso adesso, sia chi
// cambia la scadenza di un accesso gia' dato.
import { PITWALL_CONCEPT_EXPIRY_PRESETS } from "~/utils/pitwallConcept";

defineProps<{ confirmLabel: string }>();
defineEmits<{ confirm: []; cancel: [] }>();

const time = defineModel<string>({ required: true });
</script>

<template>
  <div class="pwc-expiry">
    <label>
      <span>Scade alle</span>
      <input
        v-model="time"
        type="time"
        aria-label="Orario di scadenza"
      >
    </label>
    <span class="pwc-expiry__presets">
      <button
        v-for="preset in PITWALL_CONCEPT_EXPIRY_PRESETS"
        :key="preset"
        type="button"
        :class="{ 'is-active': time === preset }"
        @click="time = preset"
      >
        {{ preset }}
      </button>
    </span>
    <span class="pwc-expiry__actions">
      <button
        type="button"
        class="pwc-link-btn"
        @click="$emit('cancel')"
      >
        Annulla
      </button>
      <button
        type="button"
        class="pwc-btn is-primary"
        @click="$emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </span>
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

.pwc-expiry {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--pwc-line);
}
.pwc-expiry label { display: flex; align-items: center; gap: 10px; }
.pwc-expiry label span {
  color: $text-secondary;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pwc-expiry input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--pwc-line);
  border-radius: 8px;
  background: #0b1119;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.pwc-expiry__presets { display: flex; gap: 6px; }
.pwc-expiry__presets button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--pwc-line);
  border-radius: 99px;
  background: none;
  color: $text-secondary;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.pwc-expiry__presets button.is-active { border-color: rgba(167, 139, 250, 0.6); color: #a78bfa; }
.pwc-expiry__actions { display: flex; align-items: center; gap: 14px; margin-left: auto; }

@media (max-width: 760px) {
  .pwc-expiry__actions { margin-left: 0; }
}
</style>
