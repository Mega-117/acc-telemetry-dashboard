<script setup lang="ts">
// ============================================
// PistePage - Tracks grid placeholder
// ============================================

const fakeTracks = [
  { name: 'Spa', hours: '--', bestQ: '--', bestR: '--' },
  { name: 'Monza', hours: '--', bestQ: '--', bestR: '--' },
  { name: 'Nürburgring', hours: '--', bestQ: '--', bestR: '--' },
  { name: 'Imola', hours: '--', bestQ: '--', bestR: '--' },
  { name: 'Barcelona', hours: '--', bestQ: '--', bestR: '--' },
  { name: 'Silverstone', hours: '--', bestQ: '--', bestR: '--' }
]
</script>

<template>
  <LayoutPageContainer>
    <h1 class="page-title">Piste</h1>
    <div class="tracks-grid">
      <div 
        v-for="track in fakeTracks" 
        :key="track.name"
        class="track-card"
      >
        <h3 class="track-name">{{ track.name }}</h3>
        <div class="track-stats">
          <span>Ore: {{ track.hours }}</span>
          <span>Best Q: {{ track.bestQ }}</span>
          <span>Best R: {{ track.bestR }}</span>
        </div>
      </div>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.page-title {
  font-family: $font-primary;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 24px;
}

.tracks-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.track-card {
  padding: 24px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba($racing-red, 0.3);
    transform: translateY(-2px);
  }
}

.track-name {
  font-family: $font-primary;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 16px;
}

.track-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

@media (max-width: 900px) {
  .tracks-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .tracks-grid {
    grid-template-columns: 1fr;
  }
}
</style>
