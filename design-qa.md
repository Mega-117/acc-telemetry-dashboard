# PIP-422 — Piste, Spotter, HUD

Visual targets: the three user-provided September 20/22 mockups. Existing
header/background, 1400px column and 40px top spacing take precedence over the
different header dimensions in the mockups.

Observed Electron surfaces: Piste grid, Spotter and HUD tyres, desktop 1904px;
Spotter also observed near 1400px. Content data differs from the mockups.

Corrections after inspection:
- HUD active switch aligned with the fields; removed superseded layout CSS.
- Developer replay moved below the main workspace.
- Spotter selects have visible borders and native arrows.
- Info groups retain compact fields and section headings.
- Existing track images retain their top edge when cropped into cards.
- Follow-up: equal-width track time cells; exact switch thumb silhouettes;
  continuous diagonal HUD selection borders; voice waveforms; Italian session
  labels with translucent fills; equal-height Spotter columns and separators;
  inset library chevrons for the selects.

Automated evidence: 49 targeted tests pass, including controlled switch state,
disabled/busy, placement errors/retries, all six HUD sections, Minimappa saves,
all four Spotter features and policies, voice/mode selection, track navigation
and cache invalidation. Typecheck passes with the existing Volar warning.
Full gate FAIL: existing app redirect source assertion, desktop helper binary
in use, and two Windows deployment fixture failures. Targeted restyle checks
remain green after the final refinements.

final result: blocked

Complete live interaction and matched-viewport comparison remain incomplete:
the user is actively operating/resizing the Electron window and computer use
reported concurrent user input. No claim of full live toggle/drag/countdown QA,
responsive coverage or final design sign-off. The implementation remains in the
authorized worktree for iteration; no deployment.
