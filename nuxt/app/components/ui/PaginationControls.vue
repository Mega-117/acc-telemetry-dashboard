<script setup lang="ts">
// ============================================
// PaginationControls - Reusable pagination component
// ============================================

const props = defineProps<{
  currentPage: number
  totalPages: number
  totalItems: number
  itemLabel?: string
  scrollTarget?: HTMLElement | null
}>()

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'pageChange': [page: number]
}>()

async function goToPage(page: number) {
  if (page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('pageChange', page)
    
    // Smooth scroll to target if provided
    if (props.scrollTarget) {
      await new Promise(resolve => setTimeout(resolve, 150)) // Wait for fade-out
      props.scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  <div v-if="totalPages > 1" class="pagination">
    <span class="pagination-info">
      {{ totalItems }} {{ itemLabel || 'elementi' }} · Pagina {{ currentPage }} di {{ totalPages }}
    </span>
    <div class="pagination-controls">
      <button 
        class="pagination-btn"
        :disabled="currentPage === 1"
        @click="prevPage"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div class="pagination-pages">
        <button 
          v-for="page in totalPages" 
          :key="page"
          :class="['page-btn', { 'page-btn--active': page === currentPage }]"
          @click="goToPage(page)"
        >{{ page }}</button>
      </div>
      <button 
        class="pagination-btn"
        :disabled="currentPage === totalPages"
        @click="nextPage"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
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

// Responsive
@media (max-width: 600px) {
  .pagination {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
