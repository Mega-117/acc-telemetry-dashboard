<script setup lang="ts">
import { computed } from 'vue'
// ============================================
// PaginationControls - Reusable pagination component
// ============================================

const props = defineProps<{
  currentPage: number
  totalPages: number
  totalItems: number
  itemLabel?: string
  scrollTarget?: HTMLElement | null
  variant?: 'default' | 'racing'
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'pageChange': [page: number]
}>()

// Constant-sized window, even when an archive has millions of pages.
const visiblePages = computed<(number | string)[]>(() => {
  const total = Math.max(1, Math.floor(props.totalPages))
  const current = Math.min(total, Math.max(1, props.currentPage))
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, 'end-gap', total]
  if (current >= total - 3) return [1, 'start-gap', total - 4, total - 3, total - 2, total - 1, total]
  return [1, 'start-gap', current - 1, current, current + 1, 'end-gap', total]
})

async function goToPage(page: number) {
  if (!props.disabled && page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('pageChange', page)
    
    // Smooth scroll to target if provided
    if (props.scrollTarget) {
      await new Promise(resolve => setTimeout(resolve, 150)) // Wait for fade-out
      const container = props.scrollTarget.closest<HTMLElement>('[data-page-scroll]')
      if (container) {
        // scrollIntoView also scrolls outer ancestors, including the app shell.
        container.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        props.scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      await new Promise(resolve => setTimeout(resolve, 300)) // Wait for scroll
    }
    
    emit('update:currentPage', page)
  }
}

async function prevPage() {
  if (props.currentPage > 1) {
    await goToPage(props.currentPage - 1)
  }
}

async function nextPage() {
  if (props.currentPage < props.totalPages) {
    await goToPage(props.currentPage + 1)
  }
}
</script>

<template>
  <div
    v-if="totalPages > 1 || variant === 'racing'"
    class="pagination"
    :class="{ 'pagination--racing': variant === 'racing' }"
  >
    <span class="pagination-info">
      {{ totalItems }} {{ itemLabel || 'elementi' }} · Pagina {{ currentPage }} di {{ totalPages }}
    </span>
    <div class="pagination-controls">
      <button 
        class="pagination-btn"
        aria-label="Pagina precedente"
        :disabled="disabled || currentPage === 1"
        @click="prevPage"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div class="pagination-pages">
        <button 
          v-for="page in visiblePages"
          :key="page"
          :class="['page-btn', { 'page-btn--active': page === currentPage, 'pagination-gap': typeof page === 'string' }]"
          :aria-label="typeof page === 'number' ? `Pagina ${page}` : 'Pagine intermedie'"
          :aria-current="page === currentPage ? 'page' : undefined"
          :disabled="disabled || typeof page === 'string'"
          @click="typeof page === 'number' && goToPage(page)"
        >
          {{ typeof page === 'number' ? page : '…' }}
        </button>
      </div>
      <button 
        class="pagination-btn"
        aria-label="Pagina successiva"
        :disabled="disabled || currentPage === totalPages"
        @click="nextPage"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.pagination-info {
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination-pages {
  display: flex;
  gap: 4px;
}

.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: #fff;
  }

  // White glow active state
  &--active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.5);
    color: #fff;
    font-weight: 600;
    box-shadow: 
      0 0 12px rgba(255, 255, 255, 0.25),
      0 0 24px rgba(255, 255, 255, 0.15),
      inset 0 0 8px rgba(255, 255, 255, 0.1);
  }
}

.pagination-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 18px;
    height: 18px;
    color: rgba(255, 255, 255, 0.6);
  }

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    svg { color: #fff; }
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.pagination--racing {
  padding: 0; margin-top: 24px; background: transparent; border: 0; border-radius: 0; gap: 16px;
  .pagination-info { color: var(--racing-data-muted); font: inherit; }
  .pagination-controls, .pagination-pages { gap: 0; }
  .pagination-controls { max-width: 100%; padding: 4px; }
  .pagination-pages { flex-wrap: wrap; justify-content: center; }
  .page-btn, .pagination-btn { flex-shrink: 0; min-width: 30px; width: auto; height: 32px; padding: 0 10px; border-radius: 0; background: transparent; border: 1px solid var(--racing-data-line); color: #ededf0; font: inherit; box-shadow: none; }
  .page-btn--active { background: var(--racing-data-accent); border-color: var(--racing-data-accent); }
  .page-btn:hover:not(:disabled):not(.page-btn--active) { background: var(--racing-data-hover); }
  .page-btn:disabled { cursor: default; opacity: .5; }
  .page-btn:focus-visible, .pagination-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
}

.pagination-gap, .pagination--racing .pagination-gap { border-color: transparent; background: transparent; box-shadow: none; cursor: default; }

// Responsive
@media (max-width: 600px) {
  .pagination {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
