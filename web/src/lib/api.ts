// Same-origin: backend lives under `/be/api/*` on the Next.js server,
// which proxies to the FastAPI host (see `next.config.ts`). iPad/LAN
// clients only need :3000. Explicit `NEXT_PUBLIC_API_URL` still wins
// for prod.
function resolveApi(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env;
  if (typeof window === "undefined") return "http://127.0.0.1:8000";
  return "/be"; // browser → "/be/api/foo" → rewritten to backend
}
export const API = resolveApi();

export type JobItem = {
  id: string;
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
  skills: { skill: string; category: string; level?: number }[];
  missed_skills?: { skill: string; level: number }[];
  description_excerpt: string;
  fit_has_reqs?: boolean;
  fit_ok?: boolean;
  fit_reasons?: string[];
  req_languages?: { code: string; level: string }[] | null;
  req_seniority?: string | null;
  req_onsite_city?: string | null;
  req_years_min?: number | null;
  req_other?: string[] | null;
  tldr?: string | null;
  days_open?: number;
  likely_stale?: boolean;
  company_openings?: number;
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

type ProfileLink = { github?: string; linkedin?: string; portfolio?: string };
type ProfilePersonal = {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: ProfileLink;
  summary: string;
  // Optional fields used by /jobs fit checker. Existing profiles without
  // them get sensible defaults at read time.
  workTypes?: string[];
  yearsExperience?: number;
  openToRelocation?: boolean;
  openToRemote?: boolean;
  goal?: string;
};
type ProfileItem = { raw?: string } & Record<string, unknown>;
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
  job_id: string;
  applied_at: string;
  status: "applied" | "interviewing" | "rejected" | "offer" | "ghost";
  notes: string;
  follow_up_at: string | null;
  job: { id: number; title: string; company: string | null; source: string; source_url: string; posted_at: string | null };
};
