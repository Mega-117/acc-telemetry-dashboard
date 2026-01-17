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
    <!-- Horizontal Layout: Left (Image + Name) | Right (Stats) -->
    <div class="track-layout">
      <!-- Left Side: Track Image with Name Overlay -->
      <div class="track-left">
        <div class="track-image" :style="{ backgroundImage: `url(${trackImage})` }"></div>
        <div class="track-image-overlay"></div>
        <!-- Track Info at bottom -->
        <div class="track-info-overlay">
          <h2 class="track-name">{{ trackName }}</h2>
          <span class="title-badge">{{ title }}</span>
        </div>
      </div>
      
      <!-- Right Side: Stats Boxes -->
      <div class="track-right">
        <!-- Best Qualy -->
        <div class="stat-box">
          <span class="stat-label">BEST QUALY</span>
          <div class="stat-value-row">
            <span class="stat-time">{{ bestQualy || '--:--.---' }}</span>
            <!-- Gold Medal SVG -->
            <svg class="medal-svg medal-gold" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 0L24 16L30 0H36L28 20L24 28L20 20L12 0H18Z" fill="#E53935"/>
              <path d="M24 16L30 0H36L28 20L24 28" fill="#C62828"/>
              <circle cx="24" cy="38" r="16" fill="#FFD54F"/>
              <circle cx="24" cy="38" r="16" fill="url(#goldGradient)"/>
              <circle cx="24" cy="38" r="13" stroke="#FFC107" stroke-width="2" fill="none"/>
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
              <path d="M18 0L24 16L30 0H36L28 20L24 28L20 20L12 0H18Z" fill="#1E88E5"/>
              <path d="M24 16L30 0H36L28 20L24 28" fill="#1565C0"/>
              <circle cx="24" cy="38" r="16" fill="#E0E0E0"/>
              <circle cx="24" cy="38" r="16" fill="url(#silverGradient)"/>
              <circle cx="24" cy="38" r="13" stroke="#BDBDBD" stroke-width="2" fill="none"/>
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
              <path d="M18 0L24 16L30 0H36L28 20L24 28L20 20L12 0H18Z" fill="#8D6E63"/>
              <path d="M24 16L30 0H36L28 20L24 28" fill="#6D4C41"/>
              <circle cx="24" cy="38" r="16" fill="#BCAAA4"/>
              <circle cx="24" cy="38" r="16" fill="url(#bronzeGradient)"/>
              <circle cx="24" cy="38" r="13" stroke="#A1887F" stroke-width="2" fill="none"/>
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
    
    <!-- Accent glow -->
    <div class="accent-glow"></div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

// === MAIN CARD ===
.track-card {
  position: relative;
  background: linear-gradient(145deg, #1a1a24 0%, #12121a 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  min-height: 280px;
  cursor: pointer;

  // Border glow
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 16px;
    padding: 1px;
    background: linear-gradient(135deg, rgba($racing-red, 0.3) 0%, transparent 50%, rgba($racing-orange, 0.2) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 5;
  }
  
  &:hover .track-image {
    transform: scale(1.05);
  }
}

// === HORIZONTAL LAYOUT ===
.track-layout {
  display: flex;
  height: 100%;
  min-height: 280px;
}

// === LEFT SIDE: Image + Name ===
.track-left {
  position: relative;
  width: 68%;
  min-height: 280px;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.track-image {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-color: #1a1a24;
  transition: transform 0.4s ease;
}

// Gradient overlay: bottom for text + right edge fade
.track-image-overlay {
  position: absolute;
  inset: 0;
  background: 
    // Right edge fade - WHITE FOR TESTING
    linear-gradient(
      to right,
      transparent 85%, rgba(12, 12, 18, 0.95) 100%
    ),

    
    // Bottom fade for text
    linear-gradient(
      to bottom,
      transparent 0%,
      transparent 50%,
      rgba(12, 12, 18, 0.7) 80%,
      rgba(12, 12, 18, 0.95) 100%
    );
  pointer-events: none;
}

// Track info overlay at bottom
.track-info-overlay {
  position: absolute;
  bottom: 27px;
  gap: 11px;
  left: 24px;
  right: 16px;
  z-index: 4;
  display: flex;
  flex-direction: column;
}

// Track name - large and bold
.track-name {
  font-family: 'Outfit', $font-primary;
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-shadow: 0 3px 20px rgba(0, 0, 0, 0.9);
  line-height: 1.1;
  margin: 0;
}

// Badge below track name - text only, no box
.title-badge {
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
}

// === RIGHT SIDE: Stats ===
.track-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  justify-content: center;
  max-width: 200px;
}

.stat-box {
  width: 100%;
  padding: 16px 0;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  &:last-of-type {
    border-bottom: none;
  }

  &--subtle {
    // Same styling, no difference needed
  }
}

.stat-label {
  display: block;
  font-family: $font-primary;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 4px;
}

.stat-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stat-time {
  font-family: 'Outfit', $font-primary;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

// SVG Medal
.medal-svg {
  height: 32px;
  width: auto;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}

.medal-gold {
  filter: drop-shadow(0 2px 6px rgba(255, 193, 7, 0.4));
}

.medal-silver {
  filter: drop-shadow(0 2px 4px rgba(158, 158, 158, 0.3));
}

.medal-bronze {
  filter: drop-shadow(0 2px 4px rgba(141, 110, 99, 0.3));
}


// === ACCENT GLOW ===
.accent-glow {
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 80px;
  background: radial-gradient(ellipse, rgba($racing-red, 0.1) 0%, transparent 70%);
  pointer-events: none;
  z-index: 1;
}

// === RESPONSIVE ===
@media (max-width: 768px) {
  .track-layout {
    flex-direction: column;
    min-height: auto;
  }
  
  .track-left {
    width: 100%;
    height: 120px;
    min-height: 120px;
  }
  
  .track-name {
    font-size: 18px;
  }
  
  .track-right {
    padding: 12px;
  }
  
  .stat-time {
    font-size: 14px;
  }
  
  .medal-svg {
    height: 28px;
  }
}
</style>
