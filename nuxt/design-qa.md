# Pitwall design QA — PIP-360

## Evidence

- Approved source: `D:/temp/codex-clipboard-11c51a56-06fb-4311-b791-647b48daa060.png`
- Live implementation: `.codex_tmp/design-qa/pitwall-1488x1059.png`
- Source pixels: 1488 × 1059
- Implementation pixels: 1488 × 1059
- CSS viewport: 1488 × 1059 at device scale 1
- Route: `http://localhost:3000/pitwall`
- Compared together in one visual pass at original resolution.

## State represented

The source uses illustrative data (Marik online and an available live MFD). The implementation intentionally renders the authenticated account's current permission, presence and MFD state instead of faking that data. Empty and stale values therefore use `N/D`, `ULTIMO ORDINE` and explanatory copy.

## Full-view result

PASS. The implementation preserves the approved hierarchy and spatial grouping: a single-row desktop header, three-part connections strip, two-column strategy/MFD workspace, tyre controls around the vehicle, vertical tyre-settings divider, purple send action and a visually distinct navy MFD surface. No horizontal overflow occurs at 1488, 1180, 760 or 390 CSS px.

## Focused checks

- Typography and spacing: PASS. Headings, control labels and numeric values remain legible; fixed-width numeric fields do not move adjacent controls when values grow.
- Colors and surfaces: PASS. Status colors remain semantic and the MFD uses the approved navy background without decorative title icons.
- Vehicle asset: PASS. The top-view car is a reusable external SVG with an accessible text alternative and preserves sharpness at all tested sizes.
- Copy and content: PASS. `Carburante in uscita`, `Pressioni pneumatici (PSI)`, tyre set, compound, tyre change, pressures, brakes, driver, repairs and stop time match the approved MFD vocabulary.
- Interaction states: PASS. Fuel, pressures and tyre-change controls update without geometry shifts; unavailable ACC-contract controls are visibly disabled rather than simulated.
- Responsiveness: PASS. Desktop retains two strategy columns; tablet and mobile collapse in reading order; mobile navigation scrolls inside its own bar instead of widening the page.
- Accessibility: PASS. Inputs have labels and spinbutton ranges, the SVG has alt text, native checkboxes/selects remain keyboard reachable, and send/order status changes use accessible live text.

## Findings

No open P1–P3 fidelity or usability findings after the final correction pass. Dynamic online/MFD values differ from the illustrative source by design and are not a fidelity defect.
