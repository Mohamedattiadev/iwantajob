# Frontend Code-Quality Audit

Scope: `web/` (Next.js app). 18,835 LOC of `.ts`/`.tsx`, 2,024 LOC of `globals.css`.
Two files account for **40%** of frontend code: `skill-sketch.tsx` (5,892) + `sketch/[slug]/page.tsx` (1,743). Both implement collaborative Excalidraw editing with substantial overlap.

---

## TL;DR — top 10 highest-leverage problems

1. **`skill-sketch.tsx` is a 5,892-line megafile** containing the host component plus 30+ subcomponents, three exporters (PNG/SVG/PDF/PPTX), an AI chat panel, a presence pad, a minimap, library logic, presentation overlay, and AI-prompt dialog. ~3,500 lines are trivially extractable. Single biggest engineering debt in the repo.
2. **Global monkey-patches at module scope** (`skill-sketch.tsx:70-95` `Array.prototype.filter`, `:122-138` `Worker` constructor, `:104-117` `console.warn/error`) installed unconditionally on first import. These leak to every test, every other component, every dependency. They mask Excalidraw bugs rather than isolating them.
3. **`isDarkHex` / `isLightHex` / luma helpers re-implemented 4 times in one file** (`:2015-2029`, `:2142-2154`, `:2517-2535`, `:4366`). The canonical one (`isLightHex` at `:4366`) is below all three duplicates.
4. **PNG/SVG/PDF export paths duplicate 80% of their setup** (stroke remap, theme/viewBg/exportScale options, paper-pattern composition). One shared `composeExportScene(els, appState, mode)` would shrink ~600 lines to ~200 and unify the colour-parity bug-class. (`:2001-2073`, `:2132-2319`, `:2484-2746`).
5. **Two near-identical realtime collab WS implementations** — `skill-sketch.tsx:1654-1750` and `sketch/[slug]/page.tsx:497-590`. Same sender-id+seq protocol, same rAF coalescing, same `applyingRemoteRef` guard, copy-pasted with subtle divergence. Extract to `lib/sketch/useCollabWS.ts`.
6. **SWR poll @ 500 ms with `dedupingInterval: 0`** (`sketch/[slug]/page.tsx:104`, `skill-sketch.tsx:366`) collides head-on with the WS push path. Comments at `:980-986` and `:1604-1610` document the recurring loop the polling has caused. Pick one transport.
7. **Three layers of element scrubbing** for the same crash (`nukedInitialData` at `:172`, `excalApiCallback`'s `updateScene` patch at `:807-864`, one-shot scrub at `:875-886`, plus the doc-apply filter at `:998-1008`). Belt-suspenders-belt-suspenders. None of them is the real fix; the real fix is upstream Excalidraw.
8. **62 type-escape casts in one file** (`as never`, `as unknown`, `// eslint-disable`) in `skill-sketch.tsx` vs 24 in the slug page. Half are legitimate Excalidraw API gaps; the other half are unmotivated.
9. **~0% test coverage of the sketch UI.** Only `web/src/lib/sketch.test.ts` (507 lines) and `web/src/lib/auth.test.ts` (86 lines) exist. Zero `.test.tsx` files. Every "fix(sketch)" commit lands blind.
10. **The crash-fix log shows the same canvas crash being fixed at least 5 times** (`b2e9adc`, `dcc34ca`, `411931d`, `416a658`, `45ec392`). Each commit added another defensive layer rather than removing the prior. Tech debt is compounding, not being repaid.

---

## 1. Megafile / God-component problems

`wc -l` of `.tsx`/`.ts` (descending):

| LOC  | File |
|------|------|
| 5892 | `web/src/components/skill-sketch.tsx` |
| 1743 | `web/src/app/sketch/[slug]/page.tsx` |
|  807 | `web/src/lib/sketch-templates.ts` (data table — fine) |
|  780 | `web/src/app/interview/page.tsx` |
|  645 | `web/src/app/cv/page.tsx` |
|  593 | `web/src/app/learn/[skill]/page.tsx` |
|  513 | `web/src/components/weekly-focus.tsx` |

### `skill-sketch.tsx` extraction map

The host `SkillSketch` component spans lines 351–2890 (~2,500 LOC). The rest of the file is co-located helper components that have **no business** living here:

| Lines | Unit | Suggested home |
|-------|------|----------------|
| 50-161 | Global window patches (filter/Worker/console/error listener) | `lib/sketch/installExcalGuards.ts` — but better: drop most (see §4) |
| 172-188 | `nukedInitialData` | `lib/sketch/scrubElements.ts` |
| 190-242 | `ExcalCrashBoundary` | `components/sketch/ExcalCrashBoundary.tsx` |
| 269-319 | `LIB_CATS`, `CANVAS_BG_SWATCHES` constants | `lib/sketch/constants.ts` |
| 289-302 | `customBgStore` external store | `lib/sketch/customBgStore.ts` |
| 321-334 | `sceneBBox` | `lib/sketch.ts` (canonical home for pure geom) |
| 1112-1303 | `LibraryFilterBar` + `fetchExcalLibrary` (~190 lines) | `components/sketch/LibraryFilterBar.tsx`, `lib/sketch/fetchExcalLibrary.ts` |
| 1345-1361 | `triggerDownload` | `lib/dom/triggerDownload.ts` |
| 1362-1610 | `SelectionAiWidget` (~250 lines) | `components/sketch/SelectionAiWidget.tsx` |
| 1612-1635 | `SketchPreloader` | `components/sketch/SketchPreloader.tsx` |
| 1635-1727 | `SidebarSwatchGrid` | `components/sketch/SidebarSwatchGrid.tsx` |
| 1717-1766 | `SidebarRow`, `SidebarIconBtn` | `components/sketch/SidebarPrimitives.tsx` |
| 1768-1850 | `bookPageTop`, `drawPaperPattern`, `pagePaperBackgroundCss` | `lib/sketch/paper.ts` |
| 1852-1906 | `BookPagesOverlay` | `components/sketch/BookPagesOverlay.tsx` |
| 1907-2165 | `PageListPopover` (~260 lines) | `components/sketch/PageListPopover.tsx` |
| 2166-2190 | `LayoutIcon` | inline / `components/sketch/icons.tsx` |
| 2193-2302 | `BookNavWidget` (~110 lines) | `components/sketch/BookNavWidget.tsx` |
| 2303-2459 | `BookOutlinePanel` | `components/sketch/BookOutlinePanel.tsx` |
| 2460-2493 | `PaperModeIcon` | `components/sketch/icons.tsx` |
| 2494-2560 | `PaperBackdrop` | `components/sketch/PaperBackdrop.tsx` |
| 2561-2585 | `clampNum`, `isLightHex` | `lib/sketch/color.ts` (and use everywhere — see §2) |
| 2586-2759 | `PropertyPanelSliders` + `SliderControl` | `components/sketch/PropertyPanelSliders.tsx` |
| 2760-2825 | `TrimMoreToolsDropdown` | `components/sketch/TrimMoreToolsDropdown.tsx` |
| 2826-2869 | `TemplateGrid` | `components/sketch/TemplateGrid.tsx` |
| 2870-3017 | `ShapeIslandTools`, `TopRightTools` | `components/sketch/TopRightTools.tsx` |
| 3018-3084 | `FloatingShare`, `ShareControl` | `components/sketch/FloatingShare.tsx` |
| 3085-3380 | `PresentPreviewPanel` | `components/sketch/PresentPreviewPanel.tsx` |
| 3196-3379 | `PadPanel` | `components/sketch/PadPanel.tsx` |
| 3381-3468 | `FrameThumb`, `PresentOverlay` | `components/sketch/Present*.tsx` |
| 3470-3525 | `ExcalDropdown`, `ExcalDropdownItem` | `components/sketch/ExcalDropdown.tsx` |
| 3527-3804 | `MinimapImpl` + `minimapPropsEqual` + `Minimap` memo | `components/sketch/Minimap.tsx` |
| 3806-3954 | `SketchChatPanel` | `components/sketch/SketchChatPanel.tsx` |
| 3965-4500 | `AiPromptDialog` | `components/sketch/AiPromptDialog.tsx` |
| 2001-2073 | `exportPng` | `lib/sketch/exportPng.ts` |
| 2075-2131 | `exportPptx` | `lib/sketch/exportPptx.ts` |
| 2132-2319 | `exportSvg` | `lib/sketch/exportSvg.ts` |
| 2484-2746 | book PDF exporter (inline arrow in JSX prop!) | `lib/sketch/exportBookPdf.ts` |
| 2323-2358 | `exportExcalidraw`, `copyShareJson` | `lib/sketch/exportNative.ts` |

After extraction, the host file shrinks to roughly **1,200–1,400 lines** of orchestration. That is still large but is the actual orchestration concern.

### `sketch/[slug]/page.tsx` (1,743 lines)

This is the "shared/iPad" page that **reimplements** ~70% of `SkillSketch`'s collab + save + book-pages logic with subtle behavioural divergence. It should consume a `useSketchCanvas()` hook plus the same subcomponents extracted above, not own its own copy.

- WS handler `:497-590` ≈ `skill-sketch.tsx:1654-1750`
- `initialData` builder `:112-138` ≈ `skill-sketch.tsx:1275-1303`
- Save+ETag logic `:281-345` ≈ `skill-sketch.tsx:1317-1386`
- Pen-patch logic `:606-757` is unique (iPad-only), keep separate.

### `web/src/app/globals.css` (2,024 lines)

Searched for sketch-specific selectors: 109 lines named with `.excal*`, `library-menu`, `library-unit`, `excal-popover-tile`, etc. That's a stylesheet of patches against Excalidraw's internal DOM. **Extract to `app/sketch.css`** and only import on sketch routes (root layout currently loads the lot for every page).

---

## 2. Code duplication

### 2.1 Luma / dark-hex detection — **4 copies**

| Location | Form |
|----------|------|
| `skill-sketch.tsx:2015-2029` | inline IIFE `bgIsDark` in `exportPng` |
| `skill-sketch.tsx:2142-2154` | inline `hexToLuma` + `bgIsDark` in `exportSvg` |
| `skill-sketch.tsx:2517-2535` | inline `isDarkHex` in book PDF arrow prop |
| `skill-sketch.tsx:4366-4383` | proper `isLightHex` helper |

The proper helper is **defined below all three duplicates** so they can't even import it without a hoist. Move to `lib/sketch/color.ts` as `{ luma, isDark, isLight }`. Fix: 4 callsites collapse to one import.

### 2.2 `Array.isArray(x.elements) ? x.elements : []`

7 sites (`skill-sketch.tsx:175, 735, 814, 991, 1277, 1680`; `sketch/[slug]/page.tsx:113, 167, 524`). Extract `safeElements(doc): unknown[]` in `lib/sketch/scrubElements.ts`. While doing it, fold in the type-string filter that 4 of these sites *also* duplicate (e.g. `:998-1008`, `:114-115`, `:880-882`).

### 2.3 Export setup duplication

`exportPng` (2001), `exportSvg` (2132), `exportToCanvas` calls inside book PDF arrow (2620) all build the same options object:

```
{ ...api.getAppState(), theme, exportWithDarkMode, exportBackground:false,
  viewBackgroundColor:"transparent", exportScale, exportEmbedScene:false }
```

…and all three remap dark strokes to `#e6e6e6` against dark bgs. One `composeExportAppState(api, { dark })` + one `remapStrokesForBg(els, dark)` would dedupe ~80 lines. Currently divergence is real: PNG remaps to `#e6e6e6`, PDF uses `useDark` to flip theme. The "PNG/SVG color parity" commit (`dcc34ca`) was a duct-tape fix for this duplication; next bug will be PDF parity.

### 2.4 Realtime WS

Already noted in §TL;DR #5. Extracting `useCollabWS({ slug, onScene, getScene })` would replace ~190 lines in each file.

### 2.5 Save + ETag prime pattern

`skill-sketch.tsx:1317-1346` (`save`) ≈ `sketch/[slug]/page.tsx:281-309`. Same `JSON.stringify`/`PUT`/`primeEtag` body. Extract `lib/sketch/saveDoc.ts`.

### 2.6 `manualSave` / `flushSaveNow` / `reset` triplet

In `skill-sketch.tsx`: `manualSave` (`:1352-1386`), `flushSaveNow` (`:1807`), beforeunload sender (`:1832`) all build similar bodies. Share a single `buildSavePayload()`.

### 2.7 Presence heartbeat

`/api/presence/{slug}` fetch is hit 4 times across the slug page (`:642, :669, :684, :294-ish`) and 4 times in `skill-sketch.tsx` (`:1409, 1427, 1504`). One `presenceClient.ts` wrapper.

---

## 3. State management smells

### 3.1 useState + useRef mirrors

Found **9 useState↔useRef mirror pairs**, each kept in sync by a one-line `useEffect`:

| State | Ref | Mirror effect |
|-------|-----|---------------|
| `livePeers`         (`:357`) | `livePeersRef`         (`:358`) | `:359` |
| `customBg`          (`:386`) | `customBgRef`          (`:387`) + `customBgStore` | `:388-394` |
| `bookPage`          (`:400`) | `bookPageRef`          (`:420`) | `:421` |
| `bookPages`         (`:426`) | `bookPagesRef`         (`:427`) | `:428` |
| `slideFocus`        (`:645`) | `slideFocusRef`        (`:655`) | `:656` |
| `paperMode`         (`:378`) | `paperModeRef`         (`:889`) | `:2382` |
| `layoutMode`        (`:399`) | `layoutModeRef`        (`:890`) | `:2383` |
| `excalMod`          (`:631`) | `excalModRef`          (`:1532`) | `:1533` |
| (`slug` prop)               | `slugRef`              (`:1404`) | `:1405` |

Plus in `sketch/[slug]/page.tsx`: `manualSaveRef`, `approvalRef`, `excalModRef`, `penRef`. Several are genuinely needed (callbacks reading latest value without re-subscribing). But `livePeersRef` and `slugRef` are only read inside one effect each and could be replaced by a stable closure or by putting the value in `useSWR`'s key. **At least 3 of these mirrors can go.**

### 3.2 Effects with stale-closure risk

`skill-sketch.tsx:908-977` `mainMenuNode = useMemo(..., [excalMod, homeHref, paperMode, layoutMode])` with explicit `// eslint-disable-next-line react-hooks/exhaustive-deps` at `:976`. The memoised closure reads `exportRef.current`, `customBgStore`, and stale callbacks. The comment claims this is intentional (avoid re-attaching Excalidraw subscribers). It works, but it's fragile — every new identifier you reference here silently uses a stale value.

### 3.3 Effects that race with SWR

The 20%-reload flake is documented at `skill-sketch.tsx:980-986`, `:1010-1047`, `:1604-1610`, and again at the recent `b2e9adc` "reload meta-sync safety net" commit. The current state is: a 500 ms SWR poll runs an apply-to-Excalidraw effect that also competes with the WS path. The `applyingRemoteRef` boolean + `lastBroadcastedOrReceivedSceneVersion` counter + `lastMetaEditAtRef` 1500 ms grace window are 3 different gates trying to suppress the same race.

The right architectural fix is **one transport**. Either:
- WS-only, with SWR loading the doc *once* and never refetching, OR
- HTTP polling only, dropping the WS path entirely.

Both are visible in the file, neither is fully trusted.

### 3.4 "Safety net" effects — always a smell

- `:875-886` "One-shot scrub" effect that strips bad elements after mount, even though the same scrub already happened in `initialData` (`:1275-1303`) and again in the `updateScene` monkey-patch (`:807-864`).
- `:733-739` "Seed the minimap from the loaded doc … gate on element count to avoid a setState-on-every-poll re-render storm." The render-storm only exists because the SWR refetch returns a fresh `doc` reference each poll. Real fix: stable selector (`useSWR({ ..., compare })` or `useMemo` on doc fingerprint), not a length gate that breaks if 2 elements are added then 2 removed.
- `:2382-2383` Two single-line effects mirroring `paperMode` / `layoutMode` to refs — needed only because of the deliberately stale `mainMenuNode` memo above. Remove the stale memo and these go too.

---

## 4. Defensive over-engineering

### 4.1 `Array.prototype.filter` global patch (`:70-95`)

Patches the *prototype* on first module import. Every subsequent `[].filter(…)` in the app (Tailwind utilities, SWR internals, React DevTools, tests) routes through your patch. The patch swallows ANY `Cannot read properties of undefined/null` thrown anywhere downstream. Risk: real bugs in unrelated callers — say a typo `xs.filter(x => x.frob.baz)` — get silently dropped.

**Fix:** Either fix the root cause in the elements you pass to Excalidraw (you already attempt this in 3 other places, §4.4), or wrap *just the Excalidraw root* with a React error boundary (you already have `ExcalCrashBoundary`, `:190-242`). Drop the prototype patch.

### 4.2 `updateScene` monkey-patch (`:812-864`)

Wraps the API's method in-place. If Excalidraw ever upgrades and starts wrapping its own `updateScene`, you've created an unbreakable interception layer. Lower-risk equivalent: a `safeUpdateScene(api, d)` helper called at every internal site (you have a finite set — they're all in this same file).

### 4.3 `Worker` constructor patch (`:122-138`)

Replaces `window.Worker` with a subclass that throws synchronously when the URL matches `subset-worker.chunk`. Works, but: (a) survives across HMR, (b) breaks anything that does `instanceof Worker` checks, (c) the comment admits the real fallback is "automatic and functionally identical" — so just suppress the **warning** instead of throwing inside the constructor.

### 4.4 Multiple scrub layers for the same crash

Counted: **4 distinct layers** of "remove malformed elements":

1. `nukedInitialData` at `:172` — used only on crash retry (`:813-864`).
2. `initialData = useMemo(...)` at `:1275-1303` — filters typeless elements + restricts appState keys.
3. SWR-apply effect at `:998-1008` — filters typeless + wipes all relational fields.
4. `excalApiCallback` patch at `:807-864` — runs on every `updateScene`.
5. One-shot post-mount scrub at `:875-886`.

That's 5, actually. The fact you needed 5 means the *type contract between the saved doc and Excalidraw* isn't enforced anywhere. Build one Zod schema for `DrawingDoc.elements`, validate at the network boundary, throw out everything that fails — once.

### 4.5 Error suppression at `:702-724`

Suppresses the exact same `Cannot read properties of undefined (reading 'type')` error already suppressed at module scope (`:147-156`). This is the duplicate "belt + suspenders" the file's own comment warned about. One of these must die.

---

## 5. Performance

### 5.1 SWR refresh @ 500 ms

`sketch/[slug]/page.tsx:104` `{ refreshInterval: 500, dedupingInterval: 0 }` — at 500 ms / 0-dedupe across an entire session, this is essentially a poll. The conditional adaptive version in `skill-sketch.tsx:364-367` (500ms when peers > 0, else 3s) is better but still hot. With WS already in place this poll should be **removed entirely or downgraded to 30 s as a safety net**.

### 5.2 `mainMenuNode` memo (`:908-977`)

This memo wraps a ~60-line JSX subtree. Dep array `[excalMod, homeHref, paperMode, layoutMode]` is fine, but the memo reads `exportRef.current.png/svg/json/excali/setPaper/setLayout/setCanvasBg` and `customBgStore` — none of those are deps. The `useEffect` at `:2363-2381` keeps `exportRef.current.*` updated without re-memo. This works but means changing any callback inside the menu requires touching this ref-bag instead of a normal prop. Trade-off, not a bug.

### 5.3 Synchronous JSON parsing in render

`skill-sketch.tsx:1038-1039` inside the SWR-apply effect: `JSON.stringify(bookPagesRef.current)` and `JSON.stringify(remotePages)` for **every poll** (every 500 ms when a peer is live). For large books this is O(N) per page. Use a content hash maintained on write, or just compare lengths + last-modified timestamps.

### 5.4 `sceneBBox` recomputed on every render

`SelectionAiWidget` at `:3186-3206`: `useMemo(() => sceneBBox(selectedEls), [selectedEls])`. Fine. But `:1138` (`insertLibElements`) calls `sceneBBox(current)` over **the entire scene** on every library drop. Acceptable for now, will bite at >10k elements.

### 5.5 `setMiniData` on every WS payload

`:1730-1731` and slug page `:553`: `setMiniData({ els: reconciled..., app: ... })` fires per remote frame. Already rAF-coalesced upstream of this, fine.

---

## 6. Coupling / boundary violations

- **Exporting concerns live inside the canvas component.** PNG/SVG/PDF/PPTX exporters (~600 lines) are inline arrow functions inside `SkillSketch`, with one (the book PDF, `:2484-2746`) literally inlined as a JSX `onExportPdf={async () => { ... }}` prop. They depend only on `excalRef.current`, `paperModeRef.current`, `customBgRef.current`, `bookPages` — none of which need the component lexical scope. Move to `lib/sketch/exports/*`.
- **`SketchChatPanel` (`:3806-3954`) is a sidebar AI chat panel.** Has zero shared state with the canvas component beyond `skill` (a string). Should be its own route or its own file.
- **`PadPanel` (`:3196-3379`) is the QR-code tablet-pairing panel.** Same — independent feature, owns its own LAN fetch (`:5021` `/api/lan`), independent file.
- **Frontend reaches into `/be/api/...`** through `lib/api.ts:12` proxy. That's clean. But the WS URL is hardcoded to `:8000` in two places (`skill-sketch.tsx:1664`, `sketch/[slug]/page.tsx:507`); should live in `lib/api.ts`.
- **`customBgStore`** (`:289-302`) is a module-level singleton. Per-tab state in a shared module — fine for now (one canvas per page) but breaks the day you mount two `<SkillSketch>` on one screen.

---

## 7. Inconsistencies

- **API base URL: two sources.** `lib/api.ts:14` `export const API` (proxy-aware), and `lib/proficiency.ts:57` `process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"` (hardcoded fallback). Remove the latter, import `API`.
- **Error handling: 3 styles.**
  - `try { ... } catch {}` (silent, ~80 sites in skill-sketch alone)
  - `try { ... } catch (e) { toast.error(...) }` (~10 sites)
  - throws caught at React error boundary (Excalidraw subtree only)
  No consistent policy. Pick one per layer (e.g. silent in onChange hot-path, toast in user-initiated actions).
- **Typing escapes — 103 instances across the codebase:**

  | File | Count |
  |------|-------|
  | `skill-sketch.tsx` | 62 |
  | `sketch/[slug]/page.tsx` | 24 |
  | `interview/page.tsx` | 3 |
  | `draw/page.tsx` | 3 |
  | others | ≤2 each |

  Worst offenders are `as never` casts around Excalidraw's `updateScene`/`getSceneElements` (which return readonly + branded types). Solution: define a single `lib/sketch/excalTypes.ts` with the API surface as a typed interface (you already have a partial `ExcalApi` at `:336-349`) and never use `never` outside of that file.
- **Mixed component patterns.** All sketch components are `function FooBar(...) {}`. Other parts of the codebase use `const FooBar = (...) => {...}`. No consistent rule. `memo` used once (`Minimap`, `:3802`); everywhere else inline JSX in the parent. Forwarded refs only in `ui/*` shadcn primitives.

---

## 8. Dead code / commented-out blocks

The file has **almost no commented-out code blocks**, which is good. It has the opposite problem: **giant explanatory comments narrating bug history**, often longer than the code they precede. E.g.:

- `:50-69`, `:96-101`, `:118-122` — three paragraphs explaining the patches before any code runs.
- `:980-986`, `:1010-1024`, `:1527-1542`, `:1583-1593` — saga-length comments justifying ref locations.

Not "dead" per se but signals: every paragraph is a postmortem of a fix that *patched* a problem rather than removed it. When you refactor, you'll be able to delete all of them.

No `TODO` / `FIXME` / `HACK` markers anywhere in the frontend (grep returned empty). Either healthy or no one writes them.

---

## 9. Type safety

Numbers already listed in §7. Notable patterns:

- `as never` for Excalidraw arrays: `:1066, 1079, 1085, 1086, 1087, 1088, ...` — at least 18 occurrences. Each one is a bypass of `restoreElements`'s branded `OrderedExcalidrawElement[]`. Define a single `unsafeAsExcalElements()` cast helper and grep-able call site.
- `(a as unknown as { ... })` chains: `:1727, 1764, 2041, 2092, 2491, 2620` and ~20 more. Each pretends an inner Excalidraw method exists. Pull these into the `ExcalApi` interface.
- `// eslint-disable-next-line react-hooks/exhaustive-deps` at `:976` — sole instance, and it's load-bearing. Document why in a one-line `// reason: ...` instead of the surrounding 8-line comment block.

---

## 10. CSS / styling drift

`web/src/app/globals.css` — **2,024 lines**. Largely shadcn variable definitions + tailwind plugins, but the bottom ~1,000 lines contain raw selector overrides targeting Excalidraw's internal DOM (`.excalidraw .help-icon`, `.excal-popover-tile`, `.library-menu`, `.library-unit`, etc.). 109 such lines.

Conventions in use, in descending preference:
1. Tailwind utility classes (most of the codebase)
2. shadcn primitives in `components/ui/*` (~15 files, ~80 LOC each — fine)
3. **Inline `style={{}}` — 91 occurrences**, 63 of them in `skill-sketch.tsx` alone. These are mostly dynamic (positions, computed colours, transforms), so inline is justified. A few are static and should move to className.
4. Raw CSS in globals.css for Excalidraw overrides — necessary because Excalidraw doesn't expose className props.

**Fix priority:** move Excalidraw overrides to a `sketch.css` co-located with the component, scoped under a wrapper class. Cut globals.css roughly in half.

---

## 11. Routing / page structure

- `app/scratch/page.tsx` (17 lines, `:1-17`): thin shim that just renders `<SkillSketch skill="Scratchpad" defaultFull homeHref="/" hideFullscreenButton />`. Fine.
- `app/sketch/[slug]/page.tsx` (1,743 lines): the iPad/shared route. **Reimplements** most of SkillSketch (see §1). Should consume the same primitives.
- `app/draw/page.tsx` (165 lines): a separate notebook *list* page (`useSWR<DrawList>("/api/drawings")`). Distinct concern, fine.

No overlapping layouts. The duplication is internal to the two big sketch files.

---

## 12. Testing

| Layer | Test files | Coverage estimate |
|-------|-----------|-------------------|
| `lib/sketch.ts` (pure helpers) | `lib/sketch.test.ts` (507 LOC) | meaningful |
| `lib/auth.ts` | `lib/auth.test.ts` (86 LOC) | meaningful |
| All `.tsx` components | **0 files** | ~0% |
| `skill-sketch.tsx` specifically | 0 | 0% |

`vitest.config.ts` exists and is configured. The infrastructure is there; no one uses it. Given the recent flake-fix cadence (§13), even smoke tests would catch regressions.

**Concrete first tests:**
- `scrubElements` (once extracted) — feed adversarial inputs, assert all dangling refs cleaned.
- `composeExportAppState` — assert PNG/SVG/PDF return matching settings for the same input.
- Mounting `SkillSketch` with an empty doc → assert no patches run, no crash boundary trip.

---

## 13. Recent commits — recurring fixes on the same file

Last 25 commits, top of branch:

- `b2e9adc fix(sketch): tight SVG viewBox + reload meta-sync safety net`
- `dcc34ca fix(sketch+ui): PNG/SVG color parity, paper density, dropdown z-index`
- `411931d feat(sketch): deterministic AI ops, robust PDF export, crash recovery`
- `416a658 fix(sketch): break save→mutate→apply→onChange infinite loop`
- `69627b9 fix(sketch): paper modes render pattern over bg-card wrapper`
- `ac6e84c fix(sketch): laser-lock stroke shape via convertToExcalidrawElements + transition guard`
- `45ec392 fix(sketch): view-mode hides minimap + laser-lock via Excalidraw's pointer cb`
- `301b6c9 fix(sketch): real laser-lock (keep laser tool, persist trails)`
- `2e87fec fix(sketch): laser button works immediately + templates as compact grid`
- `b509786 fix(sketch): PDF paper/strokes correct + native-Island outline`

**Patterns:**
- **Laser-lock fixed 4 times** in 4 consecutive commits (`2e87fec`, `301b6c9`, `45ec392`, `ac6e84c`). The feature is built on top of Excalidraw's transient laser tool which keeps fighting back. Either accept the impedance mismatch and re-architect (custom freedraw tool, not laser) or stop iterating.
- **The "Maximum update depth" / `Set.forEach → MM` loop fixed at least 3 times** (`416a658`, plus the suppression installed in `b2e9adc`, plus the rationale paragraphs at `:980-986`, `:1527-1542`). Each fix added another `setTimeout(0)` defer or another ref-mirror or another `applyingRemoteRef` gate. None addressed the structural issue: the same scene is owned by Excalidraw's store and by SWR's cache, with two-way sync between them.
- **PNG/SVG/PDF colour parity** fixed twice (`dcc34ca`, `411931d`). Will get fixed a third time when something else (presentation overlay screenshot? share-image?) needs the same logic and the duplication strikes again.

---

## Refactor roadmap

Ordered by pain/fix-cost ratio. Do them in this order — each builds on the previous.

1. **Extract `lib/sketch/color.ts`** with `luma()`, `isDark()`, `isLight()`. Replace 4 inline duplicates in `skill-sketch.tsx` (lines 2015-2029, 2142-2154, 2517-2535, 4366). ~1 hour. Risk: nil.
2. **Extract `lib/sketch/scrubElements.ts`** with `safeElements(doc)` + `dropRelations(els)`. Replace 7+ inline filter chains. While doing it, **delete the one-shot scrub effect** (`:875-886`) — `excalApiCallback`'s `updateScene` patch already does this. ~2 hours.
3. **Extract `lib/sketch/exports/{png,svg,pdf,pptx,native}.ts`** with a shared `composeExportAppState()` + `remapStrokes()`. Inline arrow at `:2484-2746` becomes a callback. The host file loses ~600 lines. ~4 hours.
4. **Extract subcomponents to `components/sketch/*.tsx`**: `Minimap`, `PadPanel`, `PresentOverlay`, `PresentPreviewPanel`, `SketchChatPanel`, `AiPromptDialog`, `BookNavWidget`, `BookOutlinePanel`, `PageListPopover`, `SidebarSwatchGrid`, `LibraryFilterBar`. ~1 day.
5. **Extract `lib/sketch/useCollabWS.ts`** and consume it from both `skill-sketch.tsx` and `sketch/[slug]/page.tsx`. Delete the duplicate WS handler. ~3 hours.
6. **Extract `lib/sketch/useSyncedDoc.ts`** for the SWR + save + apply + meta-sync logic. Consume from both pages. Delete the second copy. ~half a day.
7. **Drop one transport.** Pick WS or polling. If WS, set `refreshInterval: 0` (load-once). If polling, remove the WS connect logic. ~2 hours after step 5 lands.
8. **Drop the `Array.prototype.filter` global patch** (`:70-95`). Replace with a typed `safeUpdateScene(api, d)` wrapper that's the only path to Excalidraw mutation. The `ExcalCrashBoundary` (`:190`) already exists for the rare residual case. ~1 hour to drop; the real cost is verifying no regression.
9. **Drop the `Worker` patch** and reduce the console patches to just suppress the one specific warning string. ~30 min.
10. **Move Excalidraw CSS overrides to `sketch.css`** loaded only under the sketch routes. ~1 hour.
11. **Add component tests.** Start with `scrubElements`, `composeExportAppState`, and a smoke-mount of `<SkillSketch skill="test" />`. ~half a day.
12. **Type-up the `ExcalApi` interface** at `:336-349` to cover all real call sites; replace `as never` / `as unknown as` casts with `unsafeAsExcalElements()` + `unsafeAsAppState()` typed helpers. ~half a day.

After 1–6 the file is ~1,400 lines of orchestration + a clear contract with `lib/sketch/*`. The remaining items remove defensive layers that are no longer load-bearing.
