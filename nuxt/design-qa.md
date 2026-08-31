# Pitwall design QA — PIP-360

## Evidence

- Approved source: `D:/temp/codex-clipboard-4b9373f2-9437-48b9-9fe3-6e2315b9405d.png`
- Live implementation: `.codex_tmp/design-qa/pitwall-after-alignment-1488.png`
- Source pixels: 1488 × 1059
- Implementation pixels: 1488 × 1059
- CSS viewport: 1488 × 1059 at device scale 1
- Route: `http://localhost:3000/pitwall`
- Compared together in one visual pass at original resolution.
- Refinement pass: live CSS viewport 1488 × 1059, then 1110 × 900 and 760 × 900.

## State represented

The source uses illustrative data (Marik online and an available live MFD). The implementation intentionally renders the authenticated account's current permission, presence and MFD state instead of faking that data. Empty and stale values therefore use `N/D`, `ULTIMO ORDINE` and explanatory copy.

## Full-view result

PASS. The implementation preserves the approved hierarchy and spatial grouping: a single-row desktop header, three-part connections strip, two-column strategy/MFD workspace, tyre controls around the vehicle, vertical tyre-settings divider, purple send action and a visually distinct navy MFD surface. No horizontal overflow occurs at 1488, 1180, 760 or 390 CSS px.

## Focused checks

- Typography and spacing: PASS. Headings, control labels and numeric values remain legible; fixed-width numeric fields do not move adjacent controls when values grow.
- Colors and surfaces: PASS. Status colors remain semantic and the MFD uses the approved navy background without decorative title icons.
- Vehicle asset: PASS. The reusable external SVG now separates front, cabin and rear geometry. Its continuous symmetric curves remove the pinched nose and distorted rear deck while preserving sharpness at all tested sizes.
- Copy and content: PASS. `Carburante in uscita`, `Pressioni pneumatici (PSI)`, tyre set, compound, tyre change, pressures, brakes, driver, repairs and stop time match the approved MFD vocabulary.
- Interaction states: PASS. Fuel, pressures and tyre-change controls update without geometry shifts; unavailable ACC-contract controls are visibly disabled rather than simulated.
- Responsiveness: PASS. At 1169 px client width Strategy (652.5 px) remains on the left and MFD (472.5 px) on the right, with identical top and height and no horizontal overflow. At 1104 px client width the workspace collapses in reading order; mobile navigation scrolls inside its own bar instead of widening the page.
- Accessibility: PASS. Inputs have labels and spinbutton ranges, the SVG has alt text, native checkboxes/selects remain keyboard reachable, and send/order status changes use accessible live text.

## Alignment refinement — 2026-08-31

- Numeric centering: PASS. At 1488 × 1059 every pressure input and its 34 px value cell share the same exact vertical center (`FL/FR 562.9 px`, `RL/RR 720.4 px`).
- Stable interaction: PASS. Changing FL from `25,0` to `25,1` after layout settlement produces `dx=0`, `dy=0`, `dw=0`, `dh=0`; restoring the value uses the same geometry.
- Fuel grouping: PASS. Label, input, value cell and dedicated `L` cell all share center `411 px`; the unit no longer consumes numeric width.
- Tyre set grouping: PASS. `Set pneumatici` occupies one line above the stepper with a 7 px group gap; head and stepper do not intersect.
- Vehicle geometry: PASS. The external SVG keeps a 120:240 viewBox and renders at 112 × 224 px, with continuous symmetric hood, cabin and rear curves and no aspect-ratio distortion.
- Responsive workspace: PASS. At 1104 px client width the workspace becomes one column with `scrollWidth=1104`; at 754 px it remains one column with `scrollWidth=754`, the top controls stack, and `Set pneumatici` still occupies one line.

## Findings

No open P1–P3 fidelity or usability findings after the final correction pass. Dynamic online/MFD values differ from the illustrative source by design and are not a fidelity defect.

final result: passed
