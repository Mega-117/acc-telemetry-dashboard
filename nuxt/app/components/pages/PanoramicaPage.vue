<script setup lang="ts">
// ============================================
// PanoramicaPage - Overview with 2x2 card grid
// ============================================

// Import images
import mustangImg from '@/assets/images/cars/mustang_gt3.png'
import spaImg from '@/assets/images/tracks/spa.png'
import monzaImg from '@/assets/images/tracks/monza.png'
</script>

<template>
  <LayoutPageContainer>
    <div class="panoramica-grid">
      <!-- Top Left: Featured Car -->
      <CardsFeaturedCarCard 
        car-name="MUSTANG GT3"
        :car-image="mustangImg"
        subtitle="Ultima auto utilizzata"
        date="12/01/2026"
      />
      
      <!-- Top Right: Ultima Pista (Spa) -->
      <CardsTrackPerformanceCard
        title="Ultima pista"
        track-name="SPA – FRANCORCHAMPS"
        :track-image="spaImg"
        best-qualy="2:15.872"
        best-race="2:18.430"
        avg-time="2:19.256"
      />
      
      <!-- Bottom Left: Activity -->
      <CardsActivityCard />
      
      <!-- Bottom Right: Penultima Pista (Monza) -->
      <CardsTrackPerformanceCard
        title="Penultima pista"
        track-name="AUTODROMO DI MONZA"
        :track-image="monzaImg"
        best-qualy="1:47.234"
        best-race="1:49.012"
        avg-time="1:50.445"
      />
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
.panoramica-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

@media (max-width: 768px) {
  .panoramica-grid {
    grid-template-columns: 1fr;
  }
}
</style>
