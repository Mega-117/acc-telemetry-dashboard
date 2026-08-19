import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { loadOverviewProjectionRecoverably } from '../../app/services/gateway/overviewProjectionLoadPolicy'

describe('loadOverviewProjectionRecoverably', () => {
  it('returns the cloud projection when loading succeeds', async () => {
    const projection = { lastCar: { rawName: 'Ferrari 296 GT3' } }

    await expect(loadOverviewProjectionRecoverably(async () => projection)).resolves.toEqual({
      status: 'ready',
      projection
    })
  })

  it('turns a Firestore outage into a recoverable result', async () => {
    const offline = new Error('Failed to get document because the client is offline')
    const loadProjection = vi.fn().mockRejectedValue(offline)

    await expect(loadOverviewProjectionRecoverably(loadProjection)).resolves.toEqual({
      status: 'cloud-unavailable',
      error: offline
    })
    expect(loadProjection).toHaveBeenCalledOnce()
  })
})

describe('PanoramicaPage cloud boundary', () => {
  it('uses the recoverable loader instead of awaiting Firestore directly', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../app/components/pages/PanoramicaPage.vue', import.meta.url)),
      'utf8'
    )

    expect(source).toContain('loadOverviewProjectionRecoverably')
    expect(source).toContain("result.status === 'ready'")
    expect(source).not.toContain(
      'const projection = await telemetryGateway.getOverviewProjection'
    )
  })
})
