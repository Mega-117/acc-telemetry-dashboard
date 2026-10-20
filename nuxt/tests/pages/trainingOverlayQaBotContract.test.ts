// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'app/pages/training-overlay.vue'), 'utf8')

describe('training overlay qa bot boundary', () => {
  it('uses only the bounded preload API and renders canonical state', () => {
    expect(source).toContain('const showQuickPanelDevTools = import.meta.dev')
    expect(source).toContain('v-if="showQuickPanelDevTools" class="quick-panel-dev"')
    expect(source).toContain('trainingOverlayGetQaBotState')
    expect(source).toContain('trainingOverlayStartQaBot')
    expect(source).toContain('trainingOverlayStopQaBot')
    expect(source).toContain('qaBotView.stateLabel')
    expect(source).not.toMatch(/(?:spawn|child_process|ipcRenderer|writeFile).*qaBot/i)
  })

  it('PIP-567: the diagnostics dev buttons live inside the dev-only block and use the bounded preload call', () => {
    const devBlock = source.slice(source.indexOf('v-if="showQuickPanelDevTools" class="quick-panel-dev"'), source.indexOf('</details>'))
    expect(devBlock).toContain('v-for="item in DIAGNOSTICS_DEV_ACTIONS"')
    expect(devBlock).toContain(':data-diagnostics-dev="item.action"')
    expect(devBlock).toContain('data-diagnostics-dev-message')
    expect(source).toContain("getOverlayApi()?.trainingOverlayDiagnosticsDev?.(action)")
    for (const action of ['anomaly', 'daily', 'uncaught', 'stall', 'upload-now', 'queue-state']) expect(source).toContain(`action: '${action}'`)
  })
})
