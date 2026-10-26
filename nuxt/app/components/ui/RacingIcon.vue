<script setup lang="ts">
// PIP-633: icone da motorsport per i bottoni .rc-btn. Tratto spesso, terminali squadrati e angoli
// vivi: piu' "cruscotto" e meno giocattolo delle icone a tratto tondo.
withDefaults(defineProps<{ name: 'track' | 'stopwatch' | 'gauge' | 'chart' | 'chevron', size?: number }>(), { size: 20 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">
    <!-- Lente d'ingrandimento su una curva di pista: "guarda da vicino la pista". -->
    <template v-if="name === 'track'">
      <circle cx="10" cy="10" r="7" />
      <path d="M15.2 15.2l5.8 5.8" stroke-width="2.8" />
      <path d="M6.5 12.5l2.3-3.2 2.4 2.4 2.3-3.2" stroke-width="1.9" />
    </template>
    <!-- Cronometro: corona, pulsante laterale, lancetta. -->
    <template v-else-if="name === 'stopwatch'">
      <circle cx="12" cy="14" r="7" />
      <path d="M10 2.5h4M12 2.5V7M18.5 6.5l1.5-1.5M12 14l3.5-3.5" />
    </template>
    <!-- Contagiri: arco, tacche e lancetta verso la zona rossa. -->
    <template v-else-if="name === 'gauge'">
      <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
      <path d="M12 17l5-6M5.8 11.6l1.4 1M12 8.5v1.6M18.2 11.6l-1.4 1" />
      <path d="M3 20.5h18" stroke-width="1.6" />
    </template>
    <!-- Freccia a punta viva. -->
    <template v-else-if="name === 'chevron'">
      <path d="M9.5 6l6 6-6 6" stroke-width="2.6" />
    </template>
    <!-- Barre squadrate su una linea di base. -->
    <template v-else>
      <path d="M5 19v-6M10 19V8M15 19v-4M20 19V5" stroke-width="2.8" />
      <path d="M3 21.5h18" stroke-width="1.6" />
    </template>
  </svg>
</template>
