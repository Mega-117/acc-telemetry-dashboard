import { describe, expect, it } from 'vitest'
import { PRODUCT } from '../../shared/productIdentity'
import identity from '../../shared/product-identity.generated.json'

describe('product identity', () => {
  it('uses the packaged identity for display and technical namespaces', () => {
    expect(PRODUCT.displayName).toBe(identity.displayName)
    expect(PRODUCT.technicalName).toBe(identity.technicalName)
    expect(PRODUCT.env('ROOT')).toBe(`${identity.technicalName}_ROOT`)
    expect(Object.isFrozen(PRODUCT)).toBe(true)
  })
})
