# Pending features — sketch tool

Tracking three asks that aren't shipped yet. Each has a short scope,
root cause notes, and a concrete implementation plan so we can pick
them up cleanly later.

Branch: `refactor/sketch-sync-lan-audit`
Owner: @mohattiads

---

## 1. Laser-lock — strokes still vanish

### Symptom
Toggle Zap → laser tool activates → I draw → red trail fades like a
normal laser. Nothing persists. Expected: locked mode keeps the red
strokes on the canvas until I toggle off.

### Root cause (current best understanding)
Several rewrites already tried:

1. **Window-level pointer capture** — Excalidraw calls
   `setPointerCapture` on its own canvas during pointerdown, so
   most pointer events arrive at the canvas's bubble handler before
   ours fires. The persisted freedraw came out empty or off-canvas.

2. **`onPointerUpdate` callback** — Excalidraw's official prop. Wired
   in, payload provides world-coord pointer + button + tool. Some
   movement samples appear to be missing (laser tool may sample at a
   lower frequency than freedraw) and the emitted freedraw element
   was either dropped silently or rendered as a single dot.

3. **Element shape mismatch** — even after `convertToExcalidrawElements`
   normalization, the persisted stroke either doesn't render at all
   or is positioned at world (0,0) rather than where the pen moved.

### Plan
Three options ranked by likelihood of working.

#### A) Lean on Excalidraw's `LaserPathManager` directly
- Source: `packages/excalidraw/renderer/renderInteractiveScene.ts`
  and `packages/excalidraw/visualUpdates.ts` in the upstream repo.
- Laser strokes live in a transient buffer separate from
  `scene.elements`. They auto-clear after ~700 ms.
- Intercept the manager via a small monkey-patch (or fork the
  bundle) so when `laserLockRef.current === true`, the buffer's
  decay is skipped AND the final path snapshot is converted to a
  freedraw element on `pointerup`.
- Risk: bundle is minified; need to find the right hook in
  `chunk-K2UTITRG.js`. Likely brittle on Excalidraw upgrades.

#### B) Replace laser with a "permanent laser" freedraw preset (current Plan B)
- Click Zap → setActiveTool("freedraw") + override stroke color =
  red, opacity = 80, roughness = 0, width = 2.
- Behaves identically from the user's POV (red fading-ish color),
  strokes persist because they're real elements.
- Already rejected by the user once ("takes me to the pen"). Could
  revisit if (A) keeps failing — UX is essentially the same.

#### C) Overlay canvas approach
- Render our own transparent canvas above Excalidraw's container.
- Listen pointer events directly on it (z-index above canvas).
- Draw strokes to it. On pointerup, also commit a freedraw element
  to Excalidraw so the persisted stroke participates in scene
  ops (zoom/pan/save/export/sync).
- Cost: pointer events get intercepted away from Excalidraw, so
  panning + selection won't work while the overlay is on. Mitigate
  by enabling the overlay only when laserLock + activeTool === laser.

### Tests
- Vitest unit: feed a synthetic pointer-update sequence into a
  pure `laserSampler` function, assert the emitted freedraw element
  has correct `x`, `y`, `width`, `height`, `points`.
- Manual: lock on → draw 3 strokes → toggle off → strokes gone →
  toggle on → draw again → strokes appear.

### Acceptance
- Draw with laser while locked → stroke visible after the fade.
- Unlock → all locked strokes removed in one update.
- Locked stroke saved to backend like any other element.
- Peer (tablet) sees the persisted stroke through normal sync path.

---

## 2. Pen thickness slider (0.1 → 20)

### Symptom
The right-side properties panel currently shows fixed thickness
chips (S/M/L/XL — they're Excalidraw's built-in widths). We want a
free slider from 0.1 to 20 so a user can dial in any width.

### Current state
- `currentItemStrokeWidth` lives in Excalidraw's appState and is
  what every new element reads on creation.
- Default Excalidraw chip widths are roughly 1 / 2 / 4 / 6.
- 0.1 is below the smallest chip; 20 is well above the largest.

### Implementation plan

1. **Inject a slider next to the existing chip group**.
   - Watch for `.App-properties .stroke-width-row` in the DOM via a
     MutationObserver (we already do similar for the More-tools
     trim).
   - Append a `<div class="excal-thickness-slider">` containing:
     - a small numeric input (step 0.1, min 0.1, max 20)
     - an HTML `<input type=range>` bound to the same value
   - On change, call `excalRef.current?.updateScene({
       appState: { currentItemStrokeWidth: value }
     })`.

2. **State source-of-truth**
   - Read the current value from `appState.currentItemStrokeWidth`
     on every Excalidraw re-render (via the existing minimap
     refresh loop).

3. **Per-element override**
   - When the user has elements selected (`appState.selectedElementIds`
     is non-empty), the slider should retarget those elements:
     `mod.mutateElement(el, { strokeWidth: value })`.
   - Toast on success: "Updated N strokes to width X."

4. **Persistence**
   - The slider's *last* value is also stashed in `localStorage`
     under `sketch.thicknessPref` so subsequent sketch sessions
     remember the user's preferred width.

### Tests
- Vitest: pure helper `clampThickness(n)` clamps to `[0.1, 20]`.
- Vitest: `applyThicknessToSelection(elements, ids, value)`
  returns a new list with `strokeWidth` updated only on the matched
  ids; non-matching elements untouched.

### Acceptance
- Slider visible alongside the chip row.
- Dragging slider live-updates the current default stroke width.
- With elements selected, dragging the slider mutates their
  width without nuking unselected elements.
- Reload page → slider remembers last value.

---

## 3. Font-size slider for text

### Symptom
The properties panel shows S/M/L/XL chips for font size. We want a
free numeric / slider control covering at least 8 → 96 px so users
can hit non-stock sizes (e.g. 13 for body text, 36 for headings).

### Implementation plan

Same shape as the thickness control.

1. **Inject a slider next to the font-size chip row**.
   - Watch for the row via the same MutationObserver.
   - Append `<input type="range" min="8" max="96" step="1">` plus a
     small numeric input.

2. **State source-of-truth**
   - `appState.currentItemFontSize` is what new text inherits.
   - For selected text elements, iterate selectedElementIds and
     `mutateElement(el, { fontSize: value })`.

3. **Re-binding text → container**
   - Bound text inside a rectangle: changing fontSize may need to
     re-bind so the container expands. Use
     `mod.redrawTextBoundingBox(el)` if exposed.
   - If not exposed, fall back to plain mutateElement; Excalidraw
     will handle the next render.

4. **Persistence**
   - Store last value under `sketch.fontSizePref` in localStorage.

### Tests
- Vitest: `clampFontSize(n)` clamps to `[8, 96]`.
- Vitest: `applyFontSizeToSelection(elements, ids, value)` returns
  a new list with `fontSize` updated only on the matched ids and
  only for elements of type `text`.

### Acceptance
- Slider visible alongside font-size chips.
- Live-update of `currentItemFontSize` on drag.
- With text selected, dragging mutates selected text only.
- Reload page → slider remembers last value.

---

## Out-of-scope notes

- We considered shipping a single "Style" panel that combines
  thickness + font + color + opacity. Decided against — Excalidraw's
  existing chip layout is fine; we're augmenting, not replacing.
- Slider UI should match Excalidraw's native sliders (the Opacity
  slider already in the panel is the visual reference).
- All three features are independent — can ship in any order.

---

## Sequence

Suggested order, smallest blast radius first:

1. **Pen thickness slider** — DOM injection pattern is established
   (`TrimMoreToolsDropdown`), incremental.
2. **Font-size slider** — same shape as #1.
3. **Laser lock** — last because it requires deeper Excalidraw
   internals and may need a bundle patch.
