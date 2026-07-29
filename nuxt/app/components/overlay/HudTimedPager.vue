<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useTimedHudPager } from '~/composables/useTimedHudPager'

interface HudTimedPagerPage {
  id: string
  label: string
  temporary?: boolean
  minViewport?: {
    width: number
    height: number
  }
}

const emit = defineEmits<{
  pageChange: [page: HudTimedPagerPage]
}>()

const props = withDefaults(defineProps<{
  pages: HudTimedPagerPage[]
  defaultPage: string
  initialPage?: string
  temporaryDurationMs?: number
  floatingSwitcher?: boolean
}>(), {
  initialPage: undefined,
  temporaryDurationMs: 30_000,
  floatingSwitcher: false,
})

const safeInitialPage = props.pages.some(page => page.id === props.initialPage)
  ? props.initialPage
  : props.defaultPage
const initialPageDefinition = props.pages.find(page => page.id === safeInitialPage)
const pager = useTimedHudPager({
  defaultPage: props.defaultPage,
  initialPage: safeInitialPage,
  initialPageTemporary: initialPageDefinition?.temporary
    ?? safeInitialPage !== props.defaultPage,
  temporaryDurationMs: props.temporaryDurationMs,
})
const { activePage, progress, isTemporaryPage } = pager

watch(activePage, (pageId) => {
  const page = props.pages.find(candidate => candidate.id === pageId)
  if (page) emit('pageChange', page)
}, { immediate: true })

function selectPage(page: HudTimedPagerPage) {
  pager.selectPage(page.id, page.temporary ?? page.id !== props.defaultPage)
}

defineExpose({
  returnToDefault: pager.returnToDefault,
})

onMounted(pager.start)
onBeforeUnmount(pager.dispose)
</script>

<template>
  <section
    class="hud-timed-pager"
    :class="{ 'hud-timed-pager--floating-switcher': floatingSwitcher }"
    :data-active-page="activePage"
  >
    <div class="hud-timed-pager__content">
      <slot :name="activePage" />
    </div>

    <footer class="hud-timed-pager__footer">
      <nav
        class="hud-timed-pager__switcher"
        data-overlay-interactive
        aria-label="Pagina HUD"
      >
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
    </footer>

    <span
      v-if="isTemporaryPage"
      class="hud-timed-pager__progress"
      aria-hidden="true"
      :style="{ transform: `scaleX(${progress})` }"
    />
  </section>
</template>

<style scoped>
.hud-timed-pager {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
}

.hud-timed-pager__content {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.hud-timed-pager__footer {
  display: flex;
  flex: 0 0 max(22px, calc(24px * var(--hud-scale, 1)));
  align-items: flex-end;
  justify-content: center;
  min-width: 0;
  border-top: 1px solid rgba(255, 255, 255, .10);
}

.hud-timed-pager__switcher {
  display: flex;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .28);
  border-radius: 999px;
  background: #05070a;
  opacity: 0;
  transition: opacity 120ms ease;
  -webkit-app-region: no-drag;
}

.hud-timed-pager:hover .hud-timed-pager__switcher,
:global(html.overlay-pointer-surface-hovered) .hud-timed-pager__switcher,
.hud-timed-pager__switcher:focus-within {
  opacity: 1;
}

.hud-timed-pager__switcher button {
  min-width: max(42px, calc(48px * var(--hud-scale, 1)));
  padding: max(2px, calc(3px * var(--hud-scale, 1))) calc(7px * var(--hud-scale, 1));
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

.hud-timed-pager--floating-switcher .hud-timed-pager__footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  min-height: 24px;
  border-top: 0;
  pointer-events: none;
}

.hud-timed-pager--floating-switcher .hud-timed-pager__switcher {
  pointer-events: auto;
}

.hud-timed-pager--floating-switcher[data-active-page='target'] .hud-timed-pager__footer {
  top: 0;
  right: 0;
  bottom: auto;
  left: auto;
  align-items: flex-start;
  justify-content: flex-end;
}
</style>
