// Same-origin: every `/api/*` request goes to the Next.js server, which
// proxies to the FastAPI backend via `next.config.ts` rewrites. iPad/LAN
// clients never need a direct route to port 8000 — they only need :3000.
// Explicit `NEXT_PUBLIC_API_URL` still wins for production deploys where
// the API lives on a different host.
function resolveApi(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env;
  if (typeof window === "undefined") return "http://127.0.0.1:8000";
  return ""; // same-origin → "/api/foo"
}
export const API = resolveApi();

export const fetcher = async <T = unknown>(url: string): Promise<T> => {
  const r = await fetch(`${API}${url}`);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
};

export const post = async <T = unknown>(url: string, body?: unknown): Promise<T> => {
  const r = await fetch(`${API}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  id: number;
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
