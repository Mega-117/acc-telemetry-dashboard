<script setup lang="ts">
// A stable home slot contains general feedback; search-empty belongs to its field.
import ScrollArea from '~/components/ui/ScrollArea.vue';
defineProps<{ error: string | null; notice: string | null; warning: string | null }>();
</script>
<template>
  <ScrollArea class="pwc-feedback" label="Messaggi Pitwall">
    <p v-if="error" class="pwc-flash is-error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="pwc-flash" role="status">{{ notice }}</p>
    <p v-if="warning" class="pwc-flash is-warn" role="alert" data-testid="pitwall-clock-warning">{{ warning }}</p>
  </ScrollArea>
</template>
