export type AppFeature = 'hud'

export interface FeatureAccessContext {
  role?: string | null
  isAdmin?: boolean
}

const AUTHENTICATED_APP_ROLES = new Set(['pilot', 'coach', 'admin'])

export function canAccessFeature(feature: AppFeature, context: FeatureAccessContext): boolean {
  if (feature === 'hud') {
    return context.isAdmin === true || AUTHENTICATED_APP_ROLES.has(String(context.role || ''))
  }

  return false
}
