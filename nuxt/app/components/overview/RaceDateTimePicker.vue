<script setup lang="ts">
import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import {
  addDays, displayRaceDateTime, formatRaceDateTime, monthCells, monthLabel, parseRaceDateTime, parseTimePart,
  RACE_WEEKDAYS, sameDay, type RaceDay,
} from '~/utils/raceDateTime'

// PIP-641: date and time of a race in the site's style, instead of the browser's own picker. The calendar opens
// inside the form, under the field (a floating layer would be cut by the modal's scroll); the arrow keys move
// the day, Escape closes it without closing the modal.
const props = defineProps<{ modelValue: string, invalid?: boolean, describedby?: string, fieldId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
// Most league races are in the evening; the time stays editable.
const DEFAULT_HOUR = 21

const value = computed(() => parseRaceDateTime(props.modelValue))
const now = new Date()
const today: RaceDay = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
const open = ref(false)
const view = ref({ year: today.year, month: today.month })
const focusDay = ref<RaceDay>(today)
const hourText = ref('')
const minuteText = ref('')
const field = ref<HTMLButtonElement | null>(null)
const grid = ref<HTMLElement | null>(null)
const cells = computed(() => monthCells(view.value.year, view.value.month))
const dayLabel = (day: RaceDay) => new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  .format(new Date(day.year, day.month, day.day))
const pad = (n: number) => String(n).padStart(2, '0')

watch(value, (v) => {
  hourText.value = pad(v?.hour ?? DEFAULT_HOUR)
  minuteText.value = pad(v?.minute ?? 0)
}, { immediate: true })

function toggle() {
  if (open.value) { open.value = false; return }
  const start = value.value ?? today
  view.value = { year: start.year, month: start.month }
  focusDay.value = { year: start.year, month: start.month, day: start.day }
  open.value = true
}
function shiftMonth(delta: number) {
  const date = new Date(view.value.year, view.value.month + delta, 1)
  view.value = { year: date.getFullYear(), month: date.getMonth() }
}
function time() {
  return {
    hour: parseTimePart(hourText.value, 23) ?? value.value?.hour ?? DEFAULT_HOUR,
    minute: parseTimePart(minuteText.value, 59) ?? value.value?.minute ?? 0,
  }
}
function pick(day: RaceDay) {
  focusDay.value = day
  // A greyed day of the next or previous month brings that month into view.
  if (day.month !== view.value.month || day.year !== view.value.year) view.value = { year: day.year, month: day.month }
  emit('update:modelValue', formatRaceDateTime({ ...day, ...time() }))
}
function commitTime() {
  const current = value.value
  const next = time()
  hourText.value = pad(next.hour)
  minuteText.value = pad(next.minute)
  if (current) emit('update:modelValue', formatRaceDateTime({ ...current, ...next }))
}
function onGridKey(event: KeyboardEvent) {
  const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
  if (step === undefined) return
  event.preventDefault()
  const next = addDays(focusDay.value, step)
  focusDay.value = next
  if (next.month !== view.value.month || next.year !== view.value.year) view.value = { year: next.year, month: next.month }
  void nextTick(() => grid.value?.querySelector<HTMLElement>('[tabindex="0"]')?.focus())
}
function onEscape(event: KeyboardEvent) {
  if (!open.value) return
  event.stopPropagation()
  open.value = false
  field.value?.focus()
}
</script>

<template>
  <div class="dt-picker" @keydown.esc="onEscape">
    <button
      :id="fieldId" ref="field" type="button" class="dt-picker__field" :class="{ 'is-invalid': invalid, 'is-open': open }"
      :aria-expanded="open" :aria-invalid="invalid || undefined" :aria-describedby="describedby" @click="toggle"
    >
      <span :class="{ 'is-placeholder': !value }">{{ value ? displayRaceDateTime(value) : 'Scegli data e ora' }}</span>
      <CalendarDays :size="18" :stroke-width="1.6" aria-hidden="true" />
    </button>
    <Transition name="dt-drawer">
      <div v-if="open" class="dt-picker__panel" role="group" aria-label="Scegli data e ora">
        <div class="dt-picker__head">
          <button type="button" aria-label="Mese precedente" @click="shiftMonth(-1)"><ChevronLeft :size="18" aria-hidden="true" /></button>
          <strong aria-live="polite">{{ monthLabel(view.year, view.month) }}</strong>
          <button type="button" aria-label="Mese successivo" @click="shiftMonth(1)"><ChevronRight :size="18" aria-hidden="true" /></button>
        </div>
        <div ref="grid" class="dt-picker__grid" @keydown="onGridKey">
          <span v-for="(weekday, i) in RACE_WEEKDAYS" :key="`wd-${i}`" class="dt-picker__weekday" aria-hidden="true">{{ weekday }}</span>
          <button
            v-for="cell in cells" :key="`${cell.year}-${cell.month}-${cell.day}`" type="button" class="dt-picker__day"
            :class="{ 'is-out': !cell.inMonth, 'is-today': sameDay(cell, today), 'is-selected': sameDay(cell, value) }"
            :tabindex="sameDay(cell, focusDay) ? 0 : -1" :aria-pressed="sameDay(cell, value)" :aria-label="dayLabel(cell)"
            @click="pick(cell)"
          >{{ cell.day }}</button>
        </div>
        <div class="dt-picker__time">
          <span>Ora</span>
          <input v-model="hourText" inputmode="numeric" maxlength="2" aria-label="Ora" @change="commitTime">
          <b aria-hidden="true">:</b>
          <input v-model="minuteText" inputmode="numeric" maxlength="2" aria-label="Minuti" @change="commitTime">
          <button type="button" class="rc-btn dt-picker__done" @click="open = false">Fatto</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.dt-picker { min-width: 0; }
.dt-picker__field {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; height: 46px; padding: 0 14px;
  border: 1px solid #ffffff30; background: #ffffff04; color: #fff; font: 400 14px 'Inter', sans-serif; text-align: left; cursor: pointer;
  svg { flex-shrink: 0; color: #b4b4b4; }
  &:hover { border-color: #ffffff65; }
  &:focus-visible, &.is-open { border-color: #ff0024; outline: 1px solid #ff0024; outline-offset: 1px; }
  &.is-invalid { border-color: #ff0024; }
  .is-placeholder { color: #888; }
}
.dt-picker__panel { margin-top: 8px; padding: 12px; border: 1px solid #ffffff24; background: #0d0d0f; }
.dt-picker__head {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
  strong { font: italic 700 15px 'Racer Display', sans-serif; text-transform: uppercase; letter-spacing: .02em; }
  button { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid transparent; background: none; color: #ddd; cursor: pointer;
    &:hover { border-color: #ffffff30; color: #fff; } }
}
.dt-picker__grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.dt-picker__weekday { padding: 4px 0; color: #888; font: 600 11px 'Inter', sans-serif; text-align: center; }
.dt-picker__day {
  height: 34px; border: 1px solid transparent; background: none; color: #e6e6ea; font: 500 13px 'Inter', sans-serif;
  font-variant-numeric: tabular-nums; cursor: pointer;
  &:hover { background: #ffffff12; }
  &.is-out { color: #5c5c62; }
  &.is-today { border-color: #ffffff40; }
  &.is-selected { background: #ff0024; border-color: #ff0024; color: #fff; font-weight: 700; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
}
.dt-picker__time {
  display: flex; align-items: center; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #ffffff1a;
  > span { margin-right: 4px; color: #ccc; font-size: 12px; }
  input { width: 46px; height: 36px; padding: 0; border: 1px solid #ffffff30; background: #ffffff04; color: #fff; font: 600 15px 'Inter', sans-serif;
    font-variant-numeric: tabular-nums; text-align: center;
    &:focus { border-color: #ff0024; outline: none; } }
  b { color: #888; }
}
.dt-picker__done { margin-left: auto; min-height: 36px; padding-inline: 18px; }
.dt-drawer-enter-active, .dt-drawer-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.dt-drawer-enter-from, .dt-drawer-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) { .dt-drawer-enter-active, .dt-drawer-leave-active { transition: none; } }
</style>
