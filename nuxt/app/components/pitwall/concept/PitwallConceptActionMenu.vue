<script setup lang="ts">
import { ref, useId } from "vue";
import { Ellipsis } from "@lucide/vue";
const props = defineProps<{ label: string; actionLabel: string; primaryLabel?: string }>();
const emit = defineEmits<{ select: []; primary: [] }>();
// Il popover nativo usa il top layer: non viene tagliato dagli scroll container.
const menuId = useId();
const menu = ref<HTMLElement | null>(null);
const menuPosition = ref({ top: "0px", left: "0px" });
function positionMenu(event: MouseEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  menuPosition.value = {
    top: `${Math.min(bounds.bottom + 6, window.innerHeight - (props.primaryLabel ? 100 : 56))}px`,
    left: `${Math.max(8, bounds.right - 196)}px`,
  };
}
function selectPrimary() {
  menu.value?.hidePopover();
  emit("primary");
}
function selectAction() {
  menu.value?.hidePopover();
  emit("select");
}

</script>
<template>
  <span class="pwc-action-menu">
    <button type="button" class="pwc-action-menu__trigger" :aria-label="label" :title="label"
      :popovertarget="menuId" @click="positionMenu">
      <Ellipsis :size="20" aria-hidden="true" />
    </button>
    <div :id="menuId" ref="menu" popover="auto" class="pwc-action-menu__popup" :style="menuPosition">
      <template v-if="primaryLabel">
        <button type="button" class="is-primary-action" @click="selectPrimary">{{ primaryLabel }}</button>
        <hr>
      </template>
      <button type="button" @click="selectAction">{{ actionLabel }}</button>
    </div>
  </span>
</template>
<style scoped>
.pwc-action-menu { display: inline-flex; flex: 0 0 32px; }
.pwc-action-menu__trigger { display: grid; place-items: center; flex: 0 0 32px; width: 32px; height: 34px; padding: 0; border: 1px solid transparent; background: transparent; color: #a1a1aa; cursor: pointer; }
.pwc-action-menu__trigger:hover { background: rgb(255 255 255 / 6%); color: white; }
.pwc-action-menu__trigger:focus-visible { outline: 1px solid white; outline-offset: -2px; }
.pwc-action-menu__popup { position: fixed; margin: 0; width: 196px; box-sizing: border-box; padding: 4px; border: 1px solid #39393d; background: #111114; color: #eee; box-shadow: 0 8px 24px #0008; }
.pwc-action-menu__popup button { width: 100%; min-height: 34px; padding: 8px 12px; text-align: left; font: inherit; font-size: 12px; color: inherit; border: 0; background: transparent; cursor: pointer; }
.pwc-action-menu__popup button:hover { background: rgb(255 0 36 / 10%); color: #ff6176; }
.pwc-action-menu__popup button:focus-visible { outline: 1px solid white; outline-offset: -1px; }
.pwc-action-menu__popup hr { border: 0; border-top: 1px solid #ffffff20; margin: 4px 8px; }
.pwc-action-menu__popup .is-primary-action:hover { background: #ffffff10; color: white; }
</style>
