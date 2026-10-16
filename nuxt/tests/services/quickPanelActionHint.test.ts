// @vitest-environment jsdom
import { computed, effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { quickPanelActionHint } from '~/services/overlay/quickPanelActionHint'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'

describe('vertical quick panel command help', () => {
  it.each([
    ['coach', 'Annuncia il tempo sul giro.'], ['references', 'Annuncia i riferimenti di frenata.'],
    ['pressure-audio', 'Avvisa quando le pressioni non sono ottimali.'],
    ['target-voice', 'Annuncia se il giro è dentro o fuori target.'],
    ['fuel', 'Imposta il carburante per i minuti scelti.'],
    ['fuel-session', 'Imposta il carburante per l’intera sessione.'],
    ['pitwall', 'Apri o chiudi la stanza Pitwall.'],
    ['pressure', 'Regola le pressioni da fermo (box o griglia).'],
    ['target', 'Giro obiettivo: imposta il tempo da battere.'],
    ['target-disable', 'Tempo giro:'],
    ['sector-references', 'Settori obiettivo:'], ['sector-disable', 'Settori:'], ['timer', 'Timer:'],
    ['Timer', 'Timer:'], ['Layout verticale', 'Layout:'], ['Layout orizzontale', 'Layout:'],
    ['fuel-minus', 'Durata:'], ['fuel-plus', 'Durata:'], ['fuel-apply', 'Carburante:'],
    ['friend-accept:demo-1', 'Amicizia: accetta'], ['friend-reject:demo-1', 'Amicizia: rifiuta'],
  ])('briefly explains %s without activating it', (id, beginning) => {
    expect(quickPanelActionHint(id)).toContain(beginning)
    expect(quickPanelActionHint(id).length).toBeLessThanOrEqual(46)
  })
  it('uses a neutral prompt when no known command is selected', () => {
    for (const id of [null, undefined, 'unknown', 'toString']) {
      expect(quickPanelActionHint(id)).toBe('Seleziona un comando per i dettagli.')
    }
  })
  it('follows forward/backward wheel selection without clicking commands', async () => {
    const root = document.createElement('main')
    root.innerHTML = '<button data-overlay-wheel-action="fuel">A minuti</button><button data-overlay-wheel-action="fuel-session">Sessione</button>'
    document.body.append(root)
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const click = vi.fn()
    root.addEventListener('click', click)
    const scope = effectScope()
    try {
      const navigation = scope.run(() => useOverlayActionSelection(ref(root), () => true))!
      const hint = computed(() => quickPanelActionHint(navigation.selectedId.value))
      navigation.first()
      expect(hint.value).toBe('Imposta il carburante per i minuti scelti.')
      navigation.next()
      expect(hint.value).toBe('Imposta il carburante per l’intera sessione.')
      navigation.previous()
      expect(hint.value).toBe('Imposta il carburante per i minuti scelti.')
      await nextTick()
      expect(click).not.toHaveBeenCalled()
    } finally {
      scope.stop()
      root.remove()
      rects.mockRestore()
    }
  })
})
