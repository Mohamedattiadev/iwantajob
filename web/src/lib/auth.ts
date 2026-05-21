// LAN auth token — paired with the FastAPI `SKETCH_AUTH_TOKEN` env var.
// Token sources, in priority order:
//   1. URL `?t=<token>` (e.g. the QR-scanned iPad link or the laptop's
//      first-share link). Persisted to localStorage on first sight so
//      reloads + same-origin navs keep working without the param.
//   2. `localStorage.sketchToken` (previously stashed).
//   3. `NEXT_PUBLIC_SKETCH_TOKEN` build-time env (laptop dev convenience).
//   4. Empty string — server then either lets the request through (env
//      unset on the server) or returns 401.

const LS_KEY = "sketchToken";

export function readSketchToken(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_SKETCH_TOKEN ?? "";
  }
  try {
    const u = new URL(window.location.href);
    const fromUrl = u.searchParams.get("t");
    if (fromUrl) {
      try { window.localStorage.setItem(LS_KEY, fromUrl); } catch {}
      return fromUrl;
    }
  } catch {}
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored) return stored;
  } catch {}
  return process.env.NEXT_PUBLIC_SKETCH_TOKEN ?? "";
}

export function setSketchToken(token: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LS_KEY, token); } catch {}
}

export function clearSketchToken(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(LS_KEY); } catch {}
}

// Append `?t=<token>` (or `&t=`) to a URL when a token is known. Used by
// the laptop side to bake the token into the iPad QR link so the pad
// inherits auth on first open without the user re-entering anything.
export function appendTokenToUrl(url: string, token: string = readSketchToken()): string {
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${encodeURIComponent(token)}`;
}

// Build the auth header set passed into fetch().
export function authHeaders(token: string = readSketchToken()): Record<string, string> {
  return token ? { "X-Auth-Token": token } : {};
}
