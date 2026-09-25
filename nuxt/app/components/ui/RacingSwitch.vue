<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; label: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
<template>
  <button
    type="button"
    role="switch"
    class="racing-switch"
    :class="{ 'is-on': modelValue }"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('update:modelValue', !props.modelValue)"
  >
    <span
      class="racing-switch__track"
      aria-hidden="true"
    ><span class="racing-switch__thumb"></span></span>
  </button>
</template>
<style scoped>
.racing-switch { --switch-color: #a3a3a3; flex: 0 0 auto; width: 72px; height: 44px; padding: 5px 0; border: 0; background: transparent; cursor: pointer; }
.racing-switch__track { display: block; position: relative; height: 34px; background: var(--switch-color); clip-path: polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px); }
.racing-switch__track::before { content: ''; position: absolute; inset: 2px; background: #101111; clip-path: polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px); }
.racing-switch__thumb { position: absolute; top: 6px; left: 6px; width: 33px; height: 22px; background: var(--switch-color); clip-path: polygon(5px 0,100% 0,calc(100% - 13px) 100%,0 100%,0 5px); transition: transform .2s ease,clip-path .2s ease,background-color .2s ease; }
.racing-switch.is-on { --switch-color: #21ff83; filter: drop-shadow(0 0 5px #00ff6655); }.racing-switch.is-on .racing-switch__track::before { background: #002d15; }.racing-switch.is-on .racing-switch__thumb { transform: translateX(27px); clip-path: polygon(13px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%); }
.racing-switch:hover:not(:disabled) { filter: brightness(1.2) drop-shadow(0 0 4px #ffffff15); }.racing-switch:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }.racing-switch:disabled { opacity: .35; cursor: not-allowed; }
@media(prefers-reduced-motion: reduce) { .racing-switch__thumb { transition: none; } }
</style>
