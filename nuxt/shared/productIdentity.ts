// Mirrored by scripts/sync_product_identity.py in the desktop repository.
// Keep this consumer self-contained so standalone frontend CI needs no desktop checkout.
import identity from './product-identity.generated.json'

export const PRODUCT = Object.freeze({
  ...identity,
  env: (suffix: string) => `${identity.technicalName}_${suffix}`,
})
