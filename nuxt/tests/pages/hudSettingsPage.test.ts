import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-sfc'
import { baseParse, NodeTypes } from '@vue/compiler-dom'

describe('HUD settings page layout contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/pages/hud.vue'), 'utf8')

  it('keeps the sector editor inside the single page root required by route transitions', () => {
    const template = parse(source).descriptor.template!.content
    const root = baseParse(template).children.filter(node => node.type === NodeTypes.ELEMENT)
    expect(root).toHaveLength(1)
    expect(root[0]!.loc.source).toContain('class="sector-reference-dialog"')
    expect(root[0]!.loc.source).toContain('@cancel="sectorReferenceEditorOpen = false"')
  })

  it('uses the selected-overlay workspace instead of the expanding card grid', () => {
    expect(source).toContain('class="hud-workspace"')
    expect(source).toContain('class="hud-overlay-list"')
    expect(source).toContain('class="hud-settings"')
    expect(source).toContain("const selectedOverlayId = ref<HudOverlayId>('tyres')")
    expect(source).not.toContain('class="test-hud__grid"')
    expect(source).not.toContain('hud-overlay-list__description')
  })

  it('keeps one compact workspace with the shared switches and every overlay-specific group', () => {
    expect(source).toContain('class="hud-settings__common"')
    expect(source).toContain('class="hud-control hud-control--state"')
    expect(source).toContain(':model-value="enabled[selectedOverlayId]"')
    expect(source).toContain('@update:model-value="toggleHud(selectedOverlayId)"')
    expect(source).toContain('class="hud-settings__specific"')
    expect(source).toContain('class="hud-info-group"')
    expect(source).not.toContain('hudSettingsLayout')
    expect(source).not.toContain('hud-layout-preview')
    expect(source).toContain(':model-value="!positioning"')
    expect(source).toContain('@update:model-value="$event ? saveAndLock() : startPositioning()"')
    expect(source).toContain('placementRemainingSeconds ?? Math.round(placementAutoSaveMs / 1000)')
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
    expect(source).toContain("v-else-if=\"selectedOverlayId === 'standings'\"")
    expect(source).toContain("v-else-if=\"selectedOverlayId === 'info'\"")
    expect(source).toContain("v-else-if=\"selectedOverlayId === 'trackmap'\"")
    expect(source).toContain('supportsHudOverlayBackground(selectedOverlayId)')
    expect(source).toContain("v-if=\"sectorSupports('sectorCurrentLap')\"")
    expect(source).toContain(':disabled="selectedSettingsDisabled || !option.supported"')
    expect(source).toContain('Richiede telemetria stint avversari.')
  })

  it('provides keyboard-visible selection semantics', () => {
    expect(source).toContain(':aria-current="selectedOverlayId === overlay.id ? \'true\' : undefined"')
    expect(source).toContain('.hud-overlay-list__item:focus-visible')
    expect(source).toContain('<UiRacingSwitch')
  })
})
