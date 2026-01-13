<script setup lang="ts">
// ============================================
// TrackPerformanceCard - Track performance summary
// MATCHES FeaturedCarCard structure exactly
// ============================================

defineProps<{
  title: string
  trackName: string
  trackImage: string
  bestQualy?: string
  bestRace?: string
  avgTime?: string
}>()
</script>

<template>
  <div class="track-card" @click="$emit('click')">
    <!-- Track Image Container (same as car-image-container) -->
    <div class="track-image-container">
      <div class="track-image" :style="{ backgroundImage: `url(${trackImage})` }"></div>
      <!-- Light gradient overlay (NOT dark) -->
      <div class="image-overlay"></div>
      <!-- Title badge -->
      <span class="title-badge">{{ title }}</span>
      
      <!-- CTA Button -->
      <button class="cta-button" title="Vedi sessioni" @click.stop="$emit('cta-click')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"/>
          <path d="M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>

    <!-- Track Info (same structure as car-info) -->
    <div class="track-info">
      <h2 class="track-name">{{ trackName }}</h2>
      
      <!-- Performance Stats -->
      <div class="stats-row">
        <!-- Best Qualy -->
        <div class="stat-box">
          <span class="stat-label">BEST QUALY</span>
          <div class="stat-value-row">
            <span class="stat-time">{{ bestQualy || '--:--.---' }}</span>
            <!-- Gold Medal SVG -->
            <svg class="medal-svg medal-gold" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Ribbon -->
              <path d="M18 0L24 16L30 0H36L28 20L24 28L20 20L12 0H18Z" fill="#E53935"/>
              <path d="M24 16L30 0H36L28 20L24 28" fill="#C62828"/>
              <!-- Medal circle -->
              <circle cx="24" cy="38" r="16" fill="#FFD54F"/>
              <circle cx="24" cy="38" r="16" fill="url(#goldGradient)"/>
              <circle cx="24" cy="38" r="13" stroke="#FFC107" stroke-width="2" fill="none"/>
              <!-- Star -->
              <path d="M24 28L26.5 34H33L28 38L30 45L24 41L18 45L20 38L15 34H21.5L24 28Z" fill="#FFC107"/>
              <defs>
                <linearGradient id="goldGradient" x1="8" y1="22" x2="40" y2="54" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#FFE082"/>
                  <stop offset="1" stop-color="#FFB300"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
        
        <!-- Best Race -->
        <div class="stat-box">
          <span class="stat-label">BEST RACE</span>
          <div class="stat-value-row">
            <span class="stat-time">{{ bestRace || '--:--.---' }}</span>
            <!-- Silver Medal SVG -->
            <svg class="medal-svg medal-silver" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Ribbon -->
              <path d="M18 0L24 16L30 0H36L28 20L24 28L20 20L12 0H18Z" fill="#1E88E5"/>
              <path d="M24 16L30 0H36L28 20L24 28" fill="#1565C0"/>
              <!-- Medal circle -->
              <circle cx="24" cy="38" r="16" fill="#E0E0E0"/>
              <circle cx="24" cy="38" r="16" fill="url(#silverGradient)"/>
              <circle cx="24" cy="38" r="13" stroke="#BDBDBD" stroke-width="2" fill="none"/>
              <!-- Number 2 -->
              <text x="24" y="43" text-anchor="middle" font-size="14" font-weight="bold" fill="#757575">2</text>
              <defs>
                <linearGradient id="silverGradient" x1="8" y1="22" x2="40" y2="54" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#F5F5F5"/>
                  <stop offset="1" stop-color="#9E9E9E"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
        
        <!-- Avg Time -->
        <div class="stat-box stat-box--subtle">
          <span class="stat-label">AVG TIME</span>
          <div class="stat-value-row">
            <span class="stat-time">{{ avgTime || '--:--.---' }}</span>
            <!-- Bronze Medal SVG -->
            <svg class="medal-svg medal-bronze" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Ribbon -->
              <path d="M18 0L24 16L30 0H36L28 20L24 28L20 20L12 0H18Z" fill="#8D6E63"/>
              <path d="M24 16L30 0H36L28 20L24 28" fill="#6D4C41"/>
              <!-- Medal circle -->
              <circle cx="24" cy="38" r="16" fill="#BCAAA4"/>
              <circle cx="24" cy="38" r="16" fill="url(#bronzeGradient)"/>
              <circle cx="24" cy="38" r="13" stroke="#A1887F" stroke-width="2" fill="none"/>
              <!-- Number 3 -->
              <text x="24" y="43" text-anchor="middle" font-size="14" font-weight="bold" fill="#5D4037">3</text>
              <defs>
                <linearGradient id="bronzeGradient" x1="8" y1="22" x2="40" y2="54" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#D7CCC8"/>
                  <stop offset="1" stop-color="#8D6E63"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Accent glow (same as FeaturedCarCard) -->
    <div class="accent-glow"></div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

// === MAIN CARD (SAME AS featured-car) ===
.track-card {
  position: relative;
  background: linear-gradient(145deg, #1a1a24 0%, #12121a 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  overflow: hidden;
  min-height: 280px;
  display: flex;
  flex-direction: column;

  // SAME border glow as FeaturedCarCard
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
    z-index: 5;
  }
}

// === IMAGE CONTAINER (SAME 180px as car) ===
.track-image-container {
  position: relative;
  height: 180px;
  overflow: hidden;
}

.track-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-color: #1a1a24;
  transition: transform 0.3s ease;

  .track-card:hover & {
    transform: scale(1.02);
  }
}

// Light gradient overlay (NOT too dark)
.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    transparent 40%,
    rgba(18, 18, 26, 0.5) 70%,
    rgba(18, 18, 26, 0.9) 100%
  );
  pointer-events: none;
}

.title-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 6px 14px;
  // NEUTRAL PREMIUM - no red alert color
  background: rgba(30, 35, 50, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  font-family: $font-primary;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.8);
  z-index: 3;
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

// === TRACK INFO (SAME as car-info) ===
.track-info {
  position: relative;
  padding: 20px 24px 24px;
  margin-top: -40px;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.track-name {
  font-family: 'Outfit', $font-primary;
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 16px;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
}

// === STATS ROW ===
.stats-row {
  display: flex;
  gap: 12px;
  margin-top: auto;
}

.stat-box {
  flex: 1;
  padding: 14px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  min-height: 70px;

  &--subtle {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.05);
  }
}

.stat-label {
  display: block;
  font-family: $font-primary;
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 8px;
}

.stat-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-time {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.3px;
}

// SVG Medal - truly transparent, vertically centered
.medal-svg {
  height: 44px;
  width: auto;
  flex-shrink: 0;
  margin-top: -10px; // Shift up for better centering
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}

// Gold medal glow
.medal-gold {
  filter: drop-shadow(0 2px 6px rgba(255, 193, 7, 0.4));
}

// Silver medal subtle glow
.medal-silver {
  filter: drop-shadow(0 2px 4px rgba(158, 158, 158, 0.3));
}

// Bronze medal warm glow
.medal-bronze {
  filter: drop-shadow(0 2px 4px rgba(141, 110, 99, 0.3));
}

// === ACCENT GLOW (SAME as FeaturedCarCard) ===
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
  .track-image-container {
    height: 150px;
  }

  .track-name {
    font-size: 20px;
  }

  .track-info {
    padding: 16px 20px 20px;
  }

  .stats-row {
    flex-direction: column;
    gap: 8px;
  }

  .medal-svg {
    height: 36px;
  }
}
</style>
