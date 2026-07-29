import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('HUD settings page layout contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/pages/hud.vue'), 'utf8')

  it('uses the selected-overlay workspace instead of the expanding card grid', () => {
    expect(source).toContain('class="hud-workspace"')
    expect(source).toContain('class="hud-overlay-list"')
    expect(source).toContain('class="hud-settings"')
    expect(source).toContain("const selectedOverlayId = ref<HudOverlayId>('tyres')")
    expect(source).not.toContain('class="test-hud__grid"')
    expect(source).not.toContain('hud-overlay-list__description')
  })

  it('uses one semantic surface for common state and compact fields', () => {
    expect(source).toContain('class="hud-settings__common"')
    expect(source).toContain('class="hud-control hud-control--state"')
    expect(source).toContain('class="hud-control__state-toggle"')
    expect(source).not.toContain('class="hud-control__status"')
    expect(source).toContain('class="hud-settings__common-panel hud-settings__control-grid"')
    expect(source).toContain('Impostazioni comuni')
    expect(source).not.toContain('hud-control--read-only')
    expect(source).not.toMatch(/\.hud-settings__common\s*\{[^}]*min-height:/s)
    expect(source).toMatch(/\.hud-settings__common-panel > \.hud-control:not\(\.hud-control--state\)\s*\{[^}]*justify-content:\s*flex-start/s)
  })

  it('offers three runtime-only layout previews over the same controls', () => {
    expect(source).toContain("type HudSettingsLayout = 'columns' | 'matrix'")
    expect(source).toContain("const hudSettingsLayout = ref<HudSettingsLayout>('columns')")
    expect(source).toContain('v-for="layout in hudSettingsLayouts"')
    expect(source).toContain(':aria-pressed="hudSettingsLayout === layout.id"')
    expect(source).toContain('`hud-settings--${hudSettingsLayout}`')
    expect(source).toContain('.hud-settings--columns')
    expect(source).toContain('.hud-settings--matrix')
    expect(source).toContain('.hud-settings--columns')
    expect(source).toContain('Gli overlay con opzioni specifiche usano le stesse righe compatte di Info.')
    expect(source).toContain('class="hud-info-group"')
    expect(source).not.toMatch(/(?:localStorage|sessionStorage).*hudSettingsLayout/)
  })

  it('uses the same compact surface rhythm for overlay-specific controls', () => {
    expect(source).toContain('class="hud-settings__divider"')
    expect(source).toContain('class="hud-settings__specific"')
    expect(source).toContain('class="hud-settings__specific-panel hud-settings__control-grid"')
    expect(source).toContain('&:has(> .hud-control:nth-child(4):last-child) > .hud-control:last-child')
    expect(source).toMatch(
      /\.hud-settings__specific-panel > \.hud-control:has\(> input\[type='checkbox'\]\)\s*\{[^}]*justify-content:\s*flex-start;[^}]*gap:\s*10px;/s,
    )
    expect(source).toMatch(/> input\[type='checkbox'\]\s*\{[^}]*order:\s*-1;/s)
    expect(source).toMatch(
      /@media \(max-width:\s*980px\)[^{]*\{[\s\S]*?\.hud-settings__control-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    )
    expect(source).not.toContain('Impostazioni personalizzate')
  })

  it('separates persisted enablement from current window visibility', () => {
    expect(source).toContain('enabled[overlay.id] = settings?.enabled === true')
    expect(source).toContain('if (enabled[id]) await api.hudOverlayClose(id)')
    expect(source).toContain("else await api.hudOverlayOpen(id, { scale: scale[id] })")
    expect(source).toContain("open[overlay.id] = await api.hudOverlayIsOpen(overlay.id)")
    expect(source).toContain("open[overlay.id] ? 'Visibile ora'")
  })

  it('gates secondary settings without resetting persisted values', () => {
    expect(source).toContain('const selectedSettingsDisabled = computed(() => !apiReady.value || !enabled[selectedOverlayId.value])')
    expect(source).toContain("{ 'is-overlay-disabled': !enabled[selectedOverlayId] }")
    expect(source).toContain(':disabled="selectedSettingsDisabled"')
    expect(source).toContain(':disabled="selectedSettingsDisabled || !dashboardSettings.fuelCriticalFlashEnabled"')
    expect(source).toContain('.hud-settings.is-overlay-disabled')
    expect(source).not.toMatch(/enabled\[selectedOverlayId\].*(?:reset|clear|default)/)
  })

  it('shows controls only behind their overlay and capability conditions', () => {
    expect(source).toContain("v-if=\"selectedOverlayId === 'tyres'\"")
    expect(source).toContain("v-if=\"selectedOverlayId === 'sectors'\"")
    expect(source).toContain("v-else-if=\"selectedOverlayId === 'dashboard'\"")
    expect(source).toContain("v-else-if=\"selectedOverlayId === 'info'\"")
    expect(source).toContain('supportsHudOverlayBackground(selectedOverlayId)')
    expect(source).toContain("v-if=\"sectorSupports('sectorCurrentLap')\"")
  })

  it('provides keyboard-visible selection semantics', () => {
    expect(source).toContain(':aria-current="selectedOverlayId === overlay.id ? \'true\' : undefined"')
    expect(source).toContain('.hud-overlay-list__item:focus-visible')
    expect(source).toContain('role="switch"')
    expect(source).toContain('.hud-layout-preview__options button:focus-visible')
  })
})
