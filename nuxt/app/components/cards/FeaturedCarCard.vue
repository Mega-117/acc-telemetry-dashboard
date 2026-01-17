<script setup lang="ts">
// ============================================
// FeaturedCarCard - Premium car display box
// ============================================

defineProps<{
  carName?: string
  carImage?: string
  subtitle?: string
  date?: string
}>()
</script>

<template>
  <div class="featured-car">
    <!-- Car Image Container -->
    <div class="car-image-container">
      <!-- Placeholder image using gradient as fallback -->
      <div class="car-image" :style="carImage ? { backgroundImage: `url(${carImage})` } : {}">
        <!-- If no image, show placeholder car silhouette -->
        <svg v-if="!carImage" class="car-placeholder" viewBox="0 0 400 200" fill="none">
          <defs>
            <linearGradient id="carGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e10600" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="#ff6b00" stop-opacity="0.1"/>
            </linearGradient>
          </defs>
          <!-- Simplified GT3 car silhouette -->
          <path d="M50 140 L80 120 L120 115 L150 100 L200 95 L280 95 L320 100 L350 115 L380 130 L380 150 L50 150 Z" 
                fill="url(#carGrad)" stroke="#e10600" stroke-width="1.5"/>
          <!-- Wheels -->
          <circle cx="110" cy="150" r="20" fill="#1a1a22" stroke="#e10600" stroke-width="1.5"/>
          <circle cx="110" cy="150" r="10" fill="none" stroke="#e10600" stroke-width="1"/>
          <circle cx="310" cy="150" r="20" fill="#1a1a22" stroke="#e10600" stroke-width="1.5"/>
          <circle cx="310" cy="150" r="10" fill="none" stroke="#e10600" stroke-width="1"/>
          <!-- Windows -->
          <path d="M160 100 L200 92 L260 92 L290 100 L280 110 L170 110 Z" 
                fill="rgba(255,255,255,0.05)" stroke="#e10600" stroke-width="1"/>
        </svg>
      </div>
      <!-- Gradient overlay -->
      <div class="image-overlay"></div>
    </div>

    <!-- Car Info -->
    <div class="car-info">
      <h2 class="car-name">{{ carName || 'MUSTANG GT3' }}</h2>
      <div class="car-meta">
        <span class="car-subtitle">{{ subtitle || 'Ultima auto utilizzata' }}</span>
        <span v-if="date" class="car-date">{{ date }}</span>
      </div>
    </div>

    <!-- Accent glow -->
    <div class="accent-glow"></div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.featured-car {
  position: relative;
  background: linear-gradient(145deg, #151520 0%, #0d0d12 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  overflow: hidden;
  min-height: 280px;
  display: flex;
  flex-direction: column;

  // Subtle premium border glow
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 20px;
    padding: 1px;
    background: linear-gradient(135deg, rgba($racing-red, 0.3) 0%, transparent 50%, rgba($racing-orange, 0.2) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
}

// === IMAGE CONTAINER ===
.car-image-container {
  position: relative;
  height: 268px;
  overflow: hidden;
}

// === CTA BUTTON ===
.cta-button {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 40px;
  height: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  cursor: pointer;
  z-index: 4;
  transition: all 0.2s ease;

  svg {
    width: 20px;
    height: 20px;
    color: rgba(255, 255, 255, 0.8);
    transition: color 0.2s ease;
  }

  &:hover {
    background: rgba($racing-red, 0.7);
    border-color: rgba($racing-red, 0.8);
    box-shadow: 0 0 20px rgba($racing-red, 0.4);
    transform: scale(1.05);

    svg {
      color: #fff;
    }
  }
}

.car-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-color: #0a0a0f;
  display: flex;
  align-items: center;
  justify-content: center;
}

.car-placeholder {
  width: 80%;
  max-width: 350px;
  height: auto;
  opacity: 0.8;
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    transparent 40%,
    rgba(13, 13, 18, 0.6) 70%,
    rgba(13, 13, 18, 0.95) 100%
  );
  pointer-events: none;
}

// === CAR INFO ===
.car-info {
  position: relative;
  padding: 20px 24px 24px;
  margin-top: -40px;
  z-index: 2;
}

.car-name {
  font-family: 'Outfit', $font-primary;
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
}

.car-meta {
  display: flex;
  align-items: center;
  gap: 16px;
}

.car-subtitle {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
}

.car-date {
  font-family: $font-primary;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding-left: 16px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

// === ACCENT GLOW ===
.accent-glow {
  position: absolute;
  bottom: -50px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 100px;
  background: radial-gradient(ellipse, rgba($racing-red, 0.15) 0%, transparent 70%);
  pointer-events: none;
  z-index: 1;
}

// === RESPONSIVE ===
@media (max-width: 768px) {
  .car-image-container {
    height: 150px;
  }

  .car-name {
    font-size: 22px;
  }

  .car-info {
    padding: 16px 20px 20px;
  }
}
</style>
