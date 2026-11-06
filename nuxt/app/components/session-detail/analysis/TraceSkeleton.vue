<script setup lang="ts">
// 06/11 (user: "a short loading is fine, can it feel shorter?"): while the laps load, the Telemetria's three columns are
// already there as quiet grey blocks (sectors and list, map and the pages under it, the strip and the charts), so the
// page has its shape at once and fills in place. The words stay for screen readers.
defineProps<{ height: number, label: string }>()
</script>

<template>
  <div class="trace-skeleton" :style="{ height: `${height}px` }" role="status" data-testid="trace-skeleton">
    <span class="sr-only">{{ label }}</span>
    <div class="sk-col sk-col--left"><i class="sk sk--sectors" /><i class="sk sk--list" /></div>
    <div class="sk-col sk-col--centre"><i class="sk sk--map" /><i class="sk sk--pages" /></div>
    <div class="sk-col sk-col--right"><i class="sk sk--strip" /><i v-for="n in 4" :key="n" class="sk sk--chart" /></div>
  </div>
</template>

<style scoped lang="scss">
// The same columns as .layout-tracce (234 / 344 px, then the charts).
.trace-skeleton { display: grid; grid-template-columns: 234px 344px minmax(0, 1fr); gap: 24px; overflow: hidden; }
.sk-col { display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.sk { display: block; background: linear-gradient(90deg, #ffffff08 0%, #ffffff12 50%, #ffffff08 100%); background-size: 200% 100%; animation: sk-shine 1.4s ease-in-out infinite; }
.sk--sectors { height: 210px; } .sk--list { flex: 1 1 auto; }
.sk--map { height: 300px; } .sk--pages { flex: 1 1 auto; }
.sk--strip { height: 54px; } .sk--chart { flex: 1 1 0; }
@keyframes sk-shine { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
@media (max-width: 1100px) { .trace-skeleton { grid-template-columns: minmax(0, 1fr); } .sk-col--left, .sk-col--centre { display: none; } }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
