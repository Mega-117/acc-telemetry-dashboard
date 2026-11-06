<template>
  <section class="under-map" :aria-label="labels[index] ?? ''">
    <!-- 05/11 (user): one stage for every page, as tall as what is left of the column: switching pages slides
         sideways and never changes the height. -->
    <div class="under-map__stage">
      <Transition :name="`under-map-${direction}`">
        <div :key="index" class="under-map__page">
          <slot :index="index" />
        </div>
      </Transition>
    </div>
    <div v-if="labels.length > 1" class="under-map__dots" role="tablist" :aria-label="t('telemetry.underMap.aria')">
      <button v-for="(label, i) in labels" :key="label" type="button" role="tab" class="under-map__dot" :class="{ 'is-on': i === index }"
        :aria-selected="i === index" :aria-label="label" :title="label" @click="emit('update:index', i)" />
    </div>
  </section>
</template>

<script setup lang="ts">
// 05/11 (user): under the minimap, pages switched with dots: the stint block and the session's advice (where you
// are least consistent, the most potential, the most mistakes), which left the left column's Giro/Sessione switch.
import { ref, watch } from 'vue'
import { useI18n } from '~/i18n'

const props = defineProps<{ labels: string[], index: number }>()
const emit = defineEmits<{ 'update:index': [index: number] }>()
defineSlots<{ default(props: { index: number }): unknown }>()
const { t } = useI18n()
// The next page comes from the side of its dot: from the right going forward, from the left going back.
const direction = ref<'next' | 'prev'>('next')
watch(() => props.index, (now, before) => { direction.value = now >= before ? 'next' : 'prev' })
</script>

<style scoped lang="scss">
// 05/11 (user): one frame as wide as the column, down to the window's bottom, the dots inside it; the pages lose their own
// frame and keep their own height (only the frame grows: empty space below, never stretched rows).
// 06/11 (user): no frame, as the charts - the dots stay at the bottom of the column.
.under-map { display: flex; flex-direction: column; gap: 6px; min-height: 0; padding: 16px 0 6px; }
.under-map__stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
// 06/11 (user): a page taller than the frame scrolls here only, with no scrollbar taking width.
.under-map__page { position: absolute; inset: 0; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.under-map .under-map__page {
  > :deep(*) { flex: none; align-content: start; padding: 0; border: 0; background: none; } }
.under-map-next-enter-active, .under-map-next-leave-active, .under-map-prev-enter-active, .under-map-prev-leave-active { transition: transform .28s cubic-bezier(.2, .7, .2, 1), opacity .28s ease; }
.under-map-next-enter-from, .under-map-prev-leave-to { transform: translateX(100%); opacity: 0; }
.under-map-next-leave-to, .under-map-prev-enter-from { transform: translateX(-100%); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .under-map-next-enter-active, .under-map-next-leave-active, .under-map-prev-enter-active, .under-map-prev-leave-active { transition: none; } }
.under-map__dots { flex: none; display: flex; justify-content: center; gap: 10px; padding: 4px 0 2px; }
.under-map__dot { width: 8px; height: 8px; padding: 0; border: 1px solid #ffffff59; border-radius: 50%; background: transparent; cursor: pointer;
  &.is-on { background: #fff; border-color: #fff; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  // A larger hit area than the drawn dot.
  position: relative; &::after { content: ''; position: absolute; inset: -8px; }
}
</style>
