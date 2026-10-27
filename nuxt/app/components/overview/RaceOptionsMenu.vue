<script setup lang="ts">
import { Ellipsis, ExternalLink, Pencil, Trash2 } from '@lucide/vue'
import { ref } from 'vue'
import { useFloatingPanel } from '~/composables/useFloatingPanel'
import { useI18n } from '~/i18n'

// PIP-641: the "…" menu of a planned race. It floats above the page (in <body>, attached to its button) so the
// frosted glass really blurs what is behind it and the next rows or buttons never show through; it opens below or,
// without room, above. Open and hover states are a white veil: red is kept for errors and the delete action.
defineProps<{ label: string, simGridUrl?: string, raceUrl?: string, compact?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ edit: [], delete: [] }>()
const { t } = useI18n()

const open = ref(false)
const toggle = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const floating = useFloatingPanel(toggle, menu, open, { align: 'end' }, () => { open.value = false })

function choose(action: 'edit' | 'delete') {
  open.value = false
  if (action === 'edit') emit('edit')
  else emit('delete')
}
</script>

<template>
  <div class="race-options" :class="{ 'race-options--compact': compact }">
    <button
      ref="toggle" type="button" class="race-options__toggle" :class="{ 'is-open': open }" :aria-label="label" :title="label"
      aria-haspopup="menu" :aria-expanded="open" @click="open = !open"
    ><Ellipsis :size="26" :stroke-width="1.6" aria-hidden="true" /></button>
    <Teleport to="body">
      <Transition name="race-menu">
        <div v-if="open" ref="menu" class="race-options__menu" :class="`is-${floating.place.value?.placement ?? 'below'}`" :style="floating.style()" role="menu" :aria-label="label">
          <a v-if="simGridUrl" :href="simGridUrl" target="_blank" rel="noopener" role="menuitem" @click="open = false"><ExternalLink :size="17" aria-hidden="true" /><span>SimGrid</span></a>
          <a v-if="raceUrl" :href="raceUrl" target="_blank" rel="noopener" role="menuitem" @click="open = false"><ExternalLink :size="17" aria-hidden="true" /><span>{{ t('overview.races.raceLink') }}</span></a>
          <button type="button" role="menuitem" class="race-options__edit" :disabled="disabled" @click="choose('edit')"><Pencil :size="17" aria-hidden="true" /><span>{{ t('overview.races.edit') }}</span></button>
          <button type="button" role="menuitem" class="race-options__delete" :disabled="disabled" @click="choose('delete')"><Trash2 :size="17" aria-hidden="true" /><span>{{ t('overview.races.delete') }}</span></button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.race-options__toggle {
  display: grid; place-items: center; width: 40px; height: 40px; padding: 7px; border: 0; background: none; color: #fff; cursor: pointer;
  transition: background-color 140ms ease;
  svg { display: block; }
  &:hover, &.is-open { background: #ffffff14; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
}
// Frosted glass above the page (z-index over the overview, under the race modal's 1000).
.race-options__menu {
  position: fixed; z-index: 900; width: 216px; box-sizing: border-box; display: grid; gap: 2px; padding: 6px;
  // Lighter glass than the date picker: what is behind shows more (user, 27/10).
  border: 1px solid #ffffff38; background: #16161c66; backdrop-filter: blur(10px) saturate(1.2); box-shadow: 0 16px 40px #000b;
  a, button {
    display: flex; align-items: center; gap: 12px; min-height: 44px; width: 100%; padding: 10px 12px; border: 0; border-radius: 0;
    color: #eee; background: transparent; text-align: left; text-decoration: none; font: 500 14px/1.3 'Inter', sans-serif; cursor: pointer;
    transition: background-color 140ms ease;
  }
  svg { flex-shrink: 0; color: #b4b4b4; }
  a + .race-options__edit { border-top: 1px solid #ffffff24; margin-top: 4px; }
  .race-options__delete, .race-options__delete svg { color: #ff7a8e; }
  a:hover, button:hover:not(:disabled), a:focus-visible, button:focus-visible { background: #ffffff14; outline: none; }
  button:disabled { opacity: .4; cursor: default; }
}
.race-menu-enter-active, .race-menu-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.race-menu-enter-from, .race-menu-leave-to { opacity: 0; transform: translateY(-6px); }
.race-menu-enter-from.is-above, .race-menu-leave-to.is-above { transform: translateY(6px); }
@media (prefers-reduced-motion: reduce) { .race-menu-enter-active, .race-menu-leave-active { transition: none; } }
</style>
