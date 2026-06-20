import { authHeaders } from "./auth";

// Same-origin: backend lives under `/be/api/*` on the Next.js server,
// which proxies to the FastAPI host (see `next.config.ts`). iPad/LAN
// clients only need :3000. Local Next.js route handlers (e.g.
// `/api/presence/*`, `/api/lan`) stay on the bare `/api` namespace and
// are unaffected. Explicit `NEXT_PUBLIC_API_URL` still wins for prod.
function resolveApi(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env;
  if (typeof window === "undefined") return "http://127.0.0.1:8000";
  return "/be"; // browser → "/be/api/foo" → rewritten to backend
}
export const API = resolveApi();

// Per-URL ETag + body cache. Browser HTTP-cache handling of 304 is
// inconsistent across Brave / Safari / Chrome when combined with
// `Cache-Control: no-cache`, so we drive conditional GETs from JS
// ourselves: send `If-None-Match` with the last seen ETag, return
// the cached body on 304. Cuts /api/drawings poll bandwidth ~20x.
const etagCache = new Map<string, { etag: string; body: unknown }>();

// Let any module seed an ETag for a URL — used by `save()` after a PUT
// to preempt the inevitable post-save ETag-miss GET on the same key.
// `body` here is whatever the local code committed; doesn't have to
// match the server's canonical bytes exactly because the next fetcher
// call will still go to the network with `If-None-Match`. If the
// server's ETag matches we get 304 and return this body; if not, we
// receive a fresh 200 with the new body. Either way, no torn state.
export function primeEtag(url: string, etag: string, body: unknown) {
  if (!etag) return;
  etagCache.set(url, { etag, body });
}

export const fetcher = async <T = unknown>(url: string): Promise<T> => {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
  try {
    const cached = etagCache.get(url);
    const headers: Record<string, string> = { ...authHeaders() };
    if (cached) headers["If-None-Match"] = cached.etag;
    const r = await fetch(`${API}${url}`, {
      headers,
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    if (r.status === 304 && cached) {
      return cached.body as T;
    }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const body = (await r.json()) as T;
    const etag = r.headers.get("etag");
    if (etag) etagCache.set(url, { etag, body });
    return body;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("timeout — fetch did not respond in 8s. Check Brave Shields / network.");
    }
    throw e;
  } finally {
    if (t) clearTimeout(t);
  }
};

export const post = async <T = unknown>(url: string, body?: unknown): Promise<T> => {
  const r = await fetch(`${API}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
};

export type Stats = {
  total: number;
  target: number;
  real: number;
  by_source: { name: string; value: number }[];
  by_seniority: { name: string; value: number }[];
  top_skills: { skill: string; count: number; category: string; have: boolean }[];
  generated_at: string;
};

export type JobItem = {
  id: number;
  source: string;
  source_url: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  posted_at: string | null;
  seniority: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  score: number;
  is_intern?: boolean;
  skills: { skill: string; category: string }[];
  description_excerpt: string;
};

export type JobsResponse = {
  total: number;
  offset: number;
  limit: number;
  items: JobItem[];
  facets: { sources: string[]; skills: string[] };
};

export type LearnRow = { skill: string; count: number; pct: number; category: string };
export type LearnResponse = {
  total_real: number;
  gaps: LearnRow[];
  have: LearnRow[];
  by_category: Record<string, LearnRow[]>;
};

export type ProfileLink = { github?: string; linkedin?: string; portfolio?: string };
export type ProfilePersonal = {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: ProfileLink;
  summary: string;
};
export type ProfileItem = { raw?: string } & Record<string, unknown>;
export type Profile = {
  personal: ProfilePersonal;
  education: ProfileItem[];
  experience: ProfileItem[];
  projects: ProfileItem[];
  skills: Record<string, number>;
  languages: { name: string; level: string }[];
  certifications: ({ name?: string; issuer?: string; year?: string } | string)[];
};

export type Application = {
  id: string;
  job_id: number;
  applied_at: string;
  status: "applied" | "interviewing" | "rejected" | "offer" | "ghost";
  notes: string;
  follow_up_at: string | null;
  job: { id: number; title: string; company: string | null; source: string; source_url: string; posted_at: string | null };
};

export type ScrapeStatus = {
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  log: string[];
  result: null | {
    fetched: number;
    new: number;
    dup: number;
    extracted_jobs: number;
    skill_rows_added: number;
  };
  error: string | null;
};
