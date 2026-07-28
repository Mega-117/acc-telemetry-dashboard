<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useTimedHudPager } from '~/composables/useTimedHudPager'

interface HudTimedPagerPage {
  id: string
  label: string
  temporary?: boolean
}

const props = withDefaults(defineProps<{
  pages: HudTimedPagerPage[]
  defaultPage: string
  initialPage?: string
  temporaryDurationMs?: number
}>(), {
  initialPage: undefined,
  temporaryDurationMs: 30_000,
})

const safeInitialPage = props.pages.some(page => page.id === props.initialPage)
  ? props.initialPage
  : props.defaultPage
const pager = useTimedHudPager({
  defaultPage: props.defaultPage,
  initialPage: safeInitialPage,
  temporaryDurationMs: props.temporaryDurationMs,
})
const { activePage, progress, isTemporaryPage } = pager

function selectPage(page: HudTimedPagerPage) {
  pager.selectPage(page.id, page.temporary ?? page.id !== props.defaultPage)
}

onMounted(pager.start)
onBeforeUnmount(pager.dispose)
</script>

<template>
  <section class="hud-timed-pager" :data-active-page="activePage">
    <nav class="hud-timed-pager__switcher" aria-label="Pagina HUD">
      <button
        v-for="page in pages"
        :key="page.id"
        type="button"
        :class="{ 'is-active': activePage === page.id }"
        :aria-pressed="activePage === page.id"
        @click="selectPage(page)"
      >
        {{ page.label }}
      </button>
    </nav>

    <span
      v-if="isTemporaryPage"
      class="hud-timed-pager__progress"
      aria-hidden="true"
      :style="{ transform: `scaleX(${progress})` }"
    />

    <slot :name="activePage" />
  </section>
</template>

<style scoped>
.hud-timed-pager {
  position: relative;
  display: flex;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
}

.hud-timed-pager__switcher {
  position: absolute;
  top: calc(4px * var(--hud-scale, 1));
  left: 50%;
  z-index: 5;
  display: flex;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .28);
  border-radius: 999px;
  background: #05070a;
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 120ms ease;
  -webkit-app-region: no-drag;
}

.hud-timed-pager:hover .hud-timed-pager__switcher,
.hud-timed-pager__switcher:focus-within {
  opacity: 1;
}

.hud-timed-pager__switcher button {
  min-width: calc(48px * var(--hud-scale, 1));
  padding: calc(3px * var(--hud-scale, 1)) calc(7px * var(--hud-scale, 1));
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, .62);
  font: 900 max(9px, calc(10px * var(--hud-scale, 1))) / 1 Inter, "Segoe UI", sans-serif;
  letter-spacing: .04em;
  cursor: pointer;
}

.hud-timed-pager__switcher button + button {
  border-left: 1px solid rgba(255, 255, 255, .2);
}

.hud-timed-pager__switcher button.is-active {
  background: #f28a20;
  color: #07090d;
}

.hud-timed-pager__progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  height: max(1px, calc(2px * var(--hud-scale, 1)));
  background: #f28a20;
  transform-origin: left center;
  transition: transform 100ms linear;
  pointer-events: none;
}
</style>
