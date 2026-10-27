// Official app background (red glow, light streaks, sparks falling right to left), shared by the Vue backdrop
// (app/components/ui/RacingBackdrop.vue) and the browser loading screen (shared/spaLoading.ts), which draws the
// same background before the app exists. One source for the look, so the hand-over from one to the other is
// invisible.
export const RACING_BACKDROP_BACKGROUND = 'repeating-linear-gradient(135deg, transparent 0 148px, #ffffff04 149px, transparent 150px), '
  + 'radial-gradient(ellipse at 92% 95%, #62001677, #27000833 36%, transparent 68%), #020202'
export const RACING_SPARK_FROM = 'translate3d(110px,-110px,0)'
export const RACING_SPARK_TO = 'translate3d(-350px,350px,0)'

export interface RacingSpark { left: string, top: string, delayS: number, durationS: number }

// Keep the upper-left region quieter without changing the other trajectories.
export const RACING_SPARKS: readonly RacingSpark[] = Array.from({ length: 28 }, (_, i) => ({
  left: `${8 + ((i * 37) % 90)}%`, top: `${(i * 23) % 100}%`, delayS: -i * 1.7, durationS: 15 + i % 5 * 2,
})).filter((spark, i) => !(parseFloat(spark.left) < 45 && parseFloat(spark.top) < 35 && i % 18 !== 0))

// Every spark runs on the page clock (time since the page opened), not from when its element was created: the
// loading screen's sparks and the app's sparks are then in the same place on the same frame.
export function sparkDelay(spark: RacingSpark, nowMs: number): string {
  return `${(spark.delayS - nowMs / 1000).toFixed(3)}s`
}
