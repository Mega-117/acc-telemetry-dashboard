# Pitwall design QA — PIP-360

## Evidence

- Approved source: `D:/temp/codex-clipboard-4b9373f2-9437-48b9-9fe3-6e2315b9405d.png`
- Live implementation: `.codex_tmp/design-qa/pitwall-after-hood-1488x1059.png`
- Mobile implementation: `.codex_tmp/design-qa/pitwall-after-hood-mobile-390x1059.png`
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

## Hood and responsive-state audit — 2026-08-31

- Hood geometry: PASS. The outer front shoulder and hood panel were shortened while the cabin begins at the same `y=100` and the entire rear group is unchanged. The rendered desktop asset remains 112 × 224 px with no CSS distortion.
- Desktop spacing: PASS. Strategy and MFD remain aligned at 1488 px (`y=325.8`, height `733.7`); the four value cells remain equal at 70 × 34 px and share two exact vertical centers.
- Intermediate width: PASS. At 1180 px the FL/FR/RL/RR controls have zero measured intersection with the 112 × 224 px car; moving the controls 6 px outward removes the previous 4 px edge contact without changing desktop composition.
- Mobile tyre map: PASS. At 390 px the car renders at 88 × 176 px between two pressure rows. Measured car/control intersection is `[0, 0, 0, 0]`, left/right control intersection is `[0, 0]`, and all eight pressure buttons are 44 × 44 px.
- Mobile recent pilots: PASS. All three current rows are in normal flow; `.recent-list` has `clientHeight=scrollHeight=314` and `overflow-y: visible`, so no authorization is hidden in a nested scroll area.
- Responsive matrix: PASS. No horizontal overflow at 1488, 1180, 1120, 760, 480 or 390 CSS px. Strategy/MFD stay paired through 1121 px and stack in reading order at 1120 px and below.
- State stability: PASS. Post-change FL `25,0 → 25,1` produces `dx=0`, `dy=0`, `dw=0`, `dh=0` on workspace, strategy, tyre card, map, car, service row, repairs and MFD; the value was restored.
- Runtime console: PASS for this change. No error was introduced; only existing Nuxt layout warnings and a recoverable Firebase network refresh warning were present.

## Findings

No open P1–P3 fidelity or usability findings after the final correction pass. Dynamic online/MFD values differ from the illustrative source by design and are not a fidelity defect. The floating `FB`/inspector widgets visible in development screenshots belong to the local feedback/dev tooling and are not Pitwall product UI.

final result: passed
