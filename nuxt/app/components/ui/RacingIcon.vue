<script setup lang="ts">
// PIP-633: icone del motorsport per i bottoni .rc-btn: bandiera a scacchi, cronometro da giro,
// contagiri, barre delle statistiche. Tratto spesso, terminali squadrati, angoli vivi.
withDefaults(defineProps<{ name: 'flag' | 'stopwatch' | 'gauge' | 'chart' | 'chevron', size?: number }>(), { size: 20 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">
    <!-- Bandiera a scacchi su asta. -->
    <template v-if="name === 'flag'">
      <path d="M4 22V3" stroke-width="2.4" />
      <path d="M4 4h16v10H4" stroke-width="1.8" />
      <path d="M4 4h4v3.33H4zM12 4h4v3.33h-4zM8 7.33h4v3.34H8zM16 7.33h4v3.34h-4zM4 10.67h4V14H4zM12 10.67h4V14h-4z" fill="currentColor" stroke="none" />
    </template>
    <!-- Cronometro da giro: corona, pulsante laterale, lancetta. -->
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
    <!-- Barre squadrate su una linea di base. -->
    <template v-else-if="name === 'chart'">
      <path d="M5 19v-6M10 19V8M15 19v-4M20 19V5" stroke-width="2.8" />
      <path d="M3 21.5h18" stroke-width="1.6" />
    </template>
    <!-- Freccia a punta viva. -->
    <template v-else>
      <path d="M9.5 6l6 6-6 6" stroke-width="2.6" />
    </template>
  </svg>
</template>
