<script setup lang="ts">
// Finestra runtime: nessuna interfaccia, solo lavoro di fondo.
// Qui vive il lato pilota del Pit Wall, perche' questo e' l'unico renderer con
// accesso a Firestore e l'unico autorizzato a consegnare un ordine ad ACC.
import { usePitwallDriverPresence } from '~/composables/usePitwallDriverPresence'

usePitwallDriverPresence()
</script>

<template>
  <div aria-hidden="true"></div>
</template>
