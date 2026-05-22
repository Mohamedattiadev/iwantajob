# Important Issues — Audit & Fix Plan

Branch: `refactor/sketch-sync-lan-audit`
Date: 2026-05-21
Owner: @mohattiads

Three high-priority issues, ranked by user-visible severity. Each section:
problem → root cause hypothesis → concrete fix plan → acceptance test.

---

## Issue 1 — Code Bloat & Architectural Smells

### Problem

`web/src/components/skill-sketch.tsx` = **2058 lines**, ~31 `useState`,
5+ unrelated features. Single largest client chunk (~1.8 MB even after
tree-shaking). Drags down build, dev HMR, and first-byte on `/sketch/*`
and `/draw`.

`web/src/app/sketch/[slug]/page.tsx` = **1178 lines** — duplicates
~80 % of the WebSocket / echo-suppression / fingerprint / minimap
plumbing already in `skill-sketch.tsx`.

`web/src/app/interview/page.tsx` = **780 lines** — VAD, WebSocket,
speech-recog, multi-language, UI state all inline.

### Duplication map (laptop ↔ tablet sync)

Both files keep their own copies of:

| Concept                       | Laptop (`skill-sketch.tsx`) | Tablet (`sketch/[slug]/page.tsx`) |
|-------------------------------|-----------------------------|-----------------------------------|
| `wsRef`, throttle, trailing   | 371–392                     | 187–256                           |
| `applyingRemoteUntil` ref     | 399                         | 234                               |
| `lastEditAt`, fingerprint     | 369–370, 437                | 189–190, 273                      |
| `incomingRaf` / `incomingPending` | 506–533                 | 198–199, 343–353                  |
| WS connect/reconnect effect   | 487–550                     | 307–370                           |
| `flushPending` body           | 377–392                     | 240–256                           |

Two near-identical implementations drifted: throttle window differs
(laptop = 33 ms, tablet = 16 ms), echo-suppression window differs
(laptop = 80 ms, tablet = 80 ms but different fingerprint reset path),
trailing-flush min-wait differs (laptop = 8, tablet = 4). **Exactly the
class of drift that causes asymmetric sync bugs like Issue 2.**

### Other smells

- `app/cv/page.tsx`: 11 top-level `useState` props-drilled through 5
  inline helpers. Needs `useReducer` or context.
- `api/presence/[slug]/route.ts`: device fingerprinting + approval
  state-machine + presence map all in the route handler. Belongs in
  `web/src/lib/presence.ts`.
- Glass/blur CSS duplicated across `eye-candy.tsx`, `ambient-bg.tsx`,
  `shader-background.tsx`, `nav.tsx`. Tokenize in `globals.css`.
- Per-page raw `useSWR("/api/profile", fetcher)` everywhere instead of
  one `useProfile()` hook. 3+ pages currently refetch independently.

### Fix plan

1. **Extract a shared collab hook** `web/src/lib/use-collab-sketch.ts`
   exposing `{ onChange, connectionStatus, peers }`. Both
   `skill-sketch.tsx` and `sketch/[slug]/page.tsx` consume it. Single
   source of truth for throttle, echo-suppression, fingerprint, RAF
   coalescing. Kills Issue 2 by construction.
2. **Split `skill-sketch.tsx`** into:
   - `components/sketch/Canvas.tsx` — Excalidraw + minimap (≤300 lines)
   - `components/sketch/ExportActions.tsx` — PNG/PPTX/SVG (≤200)
   - `components/sketch/FramePresentation.tsx` — frame mode (≤300)
   - `components/sketch/AiPanel.tsx` — chat + rewrite (≤250)
   - `components/sketch/PresenceToast.tsx` — approve/deny UI (≤150)
3. **Move presence logic** out of the route handler into
   `lib/presence.ts` with pure functions; route file becomes ≤30 lines
   of HTTP glue.
4. **`lib/api.ts`** — typed hooks: `useProfile`, `useLearn`,
   `useJobs`, `useDrawing`. Delete inline `useSWR("/api/...")` calls.
5. **`lib/glass.css`** — `.glass-strong`, `.glass-weak`,
   `--glass-blur-radius` tokens. Refactor 4 callers.
6. **Verify with `npx next experimental-analyze`** — target: largest
   client chunk under 600 KB; total `static/chunks` under 6 MB.

### Acceptance

- No file in `web/src` over **400 lines**.
- `vitest` test count ≥ current; new tests for the shared collab hook.
- Production build smaller; record before/after in PR description.

---

## Issue 2 — One-way Sync Bug (Laptop → Tablet broken)

### Problem

Drawing on laptop does **not** appear on tablet. Drawing on tablet
**does** appear on laptop. Direction is asymmetric.

### What the code does

Both sides share the same Python WS broker
(`scraper/src/jobscraper/web.py:1296`) which fans every message out to
every other peer in the room — no filtering by role. So the bug is in
the client, not the server.

### Hypotheses, ranked

1. **Echo-suppression false positive on the tablet receiver.**
   `sketch/[slug]/page.tsx:338` gates incoming scenes with
   `shouldApplyIncomingScene(now, lastEditAt)` (skip if `now -
   lastEditAt < 100 ms`). On the tablet, `lastEditAt` gets bumped any
   time `onChange` fires *and is not echo-suppressed* — including
   internal Excalidraw mutations triggered by `viewModeEnabled`
   toggles at line 213–227. If the tablet's `lastEditAt` is being
   refreshed by approval flips, pen-mode patches, or pointer events
   that look like edits, the 100 ms gate eats every laptop frame.
2. **Fingerprint mismatch in echo suppression.** Laptop and tablet
   compute fingerprint as `"<count>:<lastId>"` but in different
   iteration orders. When the laptop applies an incoming tablet scene
   the laptop's fingerprint matches → broadcast suppressed correctly.
   When the tablet applies an incoming laptop scene the tablet's
   `lastSeenFingerprint` doesn't match its next onChange (because
   Excalidraw on iOS reorders elements after `updateScene`), so the
   tablet treats it as a local edit, sets `lastEditAt = now`, and the
   next 100 ms of laptop frames get gated out.
3. **`appliedFor.current !== slug` on tablet** never flips true because
   `editMode` arms a different code path than `skill-sketch.tsx`.
   Worth verifying with a `console.log` at page.tsx:268.
4. **WS auth token only set on laptop.** `readSketchToken()` returns
   non-empty on the laptop (handed off via QR), maybe empty on the
   tablet on a second nav. If backend `AUTH_TOKEN` is set,
   `web.py:1300` would close the tablet socket with 1008. But user
   reports tablet→laptop works, so the tablet *is* connected. Rule
   out unless we see 1008 in tablet devtools.

Most likely: **#1 + #2 combined.**

### Diagnostic plan (do first, ~30 min)

Add temporary `console.log("[sync]", direction, fp, lastEditAt)` at:
- `page.tsx:274` (echo suppress check on tablet)
- `page.tsx:338` (apply gate on tablet)
- `page.tsx:277` (lastEditAt set on tablet)
- `skill-sketch.tsx:386` (outgoing send on laptop)

Reproduce: draw on laptop → look at tablet console. Either:
- (a) "apply gate" rejects every scene → confirm hypothesis #1.
- (b) scenes arrive, `updateScene` runs, but tablet's next onChange
  has different fingerprint → confirm hypothesis #2.

### Fix plan

After diagnosis confirms cause:

1. **Replace ID-order fingerprint with order-independent hash.**
   ```ts
   // lib/sketch.ts
   export function sceneFingerprint(els: readonly unknown[]): string {
     let cnt = 0;
     let h = 0;        // simple xor-sum of id hashes — order-independent
     for (const raw of els) {
       const e = raw as { id?: string; isDeleted?: boolean } | null;
       if (!e || e.isDeleted) continue;
       cnt++;
       if (e.id) h ^= cheapHash(e.id);
     }
     return `${cnt}:${h.toString(36)}`;
   }
   ```
2. **Replace `lastEditAt` gate with explicit "I just dispatched
   updateScene" flag** plumbed through the unified collab hook.
   Stop using wall-clock windows; use a counter incremented before
   `updateScene` and decremented after the next `onChange`.
3. **Per-message sequence numbers**: sender stamps
   `{ seq, senderId }`; receiver tracks `lastSeqBySender` and ignores
   anything `<= lastSeq`. Kills echo and reorder issues definitively.
4. **Symmetric throttle**: both sides 33 ms (laptop value). The 16 ms
   tablet value floods the laptop and makes the laptop's echo window
   permanently open.

### Acceptance

- Reproduce: open the same `/sketch/<slug>` on laptop + tablet. Draw
  on each in alternation for 30 s. Both canvases identical at the
  end. No frames dropped (count strokes).
- Add a Vitest with mocked WS: simulate 10 laptop-sourced scenes
  arriving, assert all 10 land in `updateScene` calls.

---

## Issue 3 — LAN Sharing Is Bad UX

### Current flow

1. Laptop calls `GET /api/lan` → returns array of LAN IPv4s.
2. UI builds a URL `http://<ip>:3000/sketch/<slug>?mode=edit&pen=1&t=<token>`.
3. Renders QR code (via dynamic `qrcode` import in `skill-sketch.tsx`).
4. Tablet scans → opens link → enters PIN approval dance with the host
   through `api/presence/[slug]` POST/PATCH.

### What's wrong with it

- **Cleartext token in QR & URL bar** — anyone shoulder-surfing the
  iPad screen or the QR has the credential forever (no rotation).
- **Two competing auth layers** — `t=` query token AND
  approval-state-machine PIN. They don't reinforce each other; either
  can lock the user out while the other appears fine.
- **Picks wrong NIC** when laptop has multiple LANs (VPN, Docker
  bridges). `api/lan/route.ts:18–24` does a static sort 192>10>172 but
  doesn't probe reachability. User has to retry on the right URL.
- **Hard-coded `:8000` WS port** in `skill-sketch.tsx:492` and
  `page.tsx:315` — breaks any deployment that doesn't run FastAPI on
  8000 or proxies it. Also makes mDNS hostnames fail (no SSL).
- **HTTP only** — Safari on iPadOS keeps tightening rules around
  mixed-origin WebSockets on plain HTTP. Will break with no warning.
- **Approval toast lives inside the giant `SkillSketch` component** so
  it disappears if the host navigates pages.
- **No persistence**: every fresh tab on the tablet needs a new QR
  scan because the token is in `localStorage` keyed per browser and
  the tablet's session approval is in volatile server memory (`g.__presence`).

### Replacement options (pick one)

#### Option A — Short-lived pairing code + WebRTC datachannel (recommended)

- Laptop generates 6-digit code, displays it big.
- Tablet visits `https://<lan-ip>/pair`, enters code.
- Backend (FastAPI) brokers a single WebRTC offer/answer exchange.
- Drawing data flows **peer-to-peer** over WebRTC `DataChannel` —
  zero server round-trip after handshake. Faster than current WS,
  no `:8000` exposure, code expires in 60 s.
- Approval already implicit (must have the code).
- Same code can be typed by hand if QR fails.

Cost: ~1 day implementation, +1 dep (`simple-peer` or hand-rolled).
Big win on latency and security.

#### Option B — mDNS + magic-link

- Backend advertises `iwantajob.local` over mDNS (Bonjour ships on
  iPadOS).
- Laptop UI shows: "On the iPad open `iwantajob.local` and tap
  Connect."
- Tablet hits the page, gets a one-time `Set-Cookie` after host clicks
  Accept. Cookie carries auth from then on, no URL token.

Cost: half a day. Solves the wrong-NIC + URL-token problems but
doesn't fix latency.

#### Option C — Keep WS, harden it

If P2P is too much: at minimum,
1. Rotate `AUTH_TOKEN` per session (signed JWT with 1 h TTL).
2. Move WS to same origin via Next rewrite (`/ws/...` → `:8000/ws/...`),
   drop hard-coded port from client.
3. Persist approvals to disk (sqlite) so a backend restart doesn't
   kick the iPad mid-presentation.
4. Probe NICs (try a TCP connect from a hidden iframe) before showing
   the QR. Only show URLs that actually work.

Cost: ~3 hours. Doesn't fix any of the architectural issues but kills
the most visible bugs.

### Recommendation

Do **Option C first** (3 h, immediate user-facing relief), then
schedule **Option A** for next sprint once Issue 1's refactor lands
(easier to swap transport when the collab logic is a single hook).

### Acceptance

- iPad pairs in under 10 s with no typed URL.
- WS/transport URL has zero hard-coded port in client code.
- Auth token never appears in URL bar.
- Backend restart doesn't void an existing pairing.
- Works on a laptop with active VPN + Docker without picking the
  wrong NIC.

---

## Suggested order of work

1. **Diagnostic logs** for Issue 2 (30 min) — confirm hypothesis.
2. **Issue 3 Option C quick wins** (3 h) — relieves daily pain.
3. **Issue 1 step 1** (`use-collab-sketch.ts`) — unblocks Issue 2 fix
   and Option A.
4. **Issue 2 fix** inside the new hook (seq numbers + order-independent
   fingerprint).
5. **Issue 1 steps 2–6** (component split, presence move, shared API
   hooks, glass tokens, bundle measurement).
6. **Issue 3 Option A** (WebRTC P2P).

Each step is independently shippable. Land in that order on this
branch with one commit per step so reverts are surgical.
