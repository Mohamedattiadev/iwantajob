import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Schema for IWANTAJOB. Every domain table is per-user — `userId` is required
// and indexed. `authTables` provides the `users`, `accounts`, etc. that
// @convex-dev/auth manages; do not redefine `users` here.
export default defineSchema({
  ...authTables,

  // Global shared catalog of scraped jobs. Collectors run as scheduled
  // Convex actions and upsert into this table. Per-user filtering and
  // scoring happen at read time against the caller's profile. Dedupe
  // key is (source, source_id).
  jobs_pool: defineTable({
    source: v.string(),
    source_id: v.string(),
    source_url: v.string(),
    title: v.string(),
    company: v.optional(v.string()),
    location: v.optional(v.string()),
    remote: v.optional(v.boolean()),
    posted_at: v.optional(v.number()),
    description: v.optional(v.string()),
    employment_type: v.optional(v.string()),
    salary_min: v.optional(v.number()),
    salary_max: v.optional(v.number()),
    currency: v.optional(v.string()),
    fetched_at: v.number(),
  })
    .index("by_source_and_id", ["source", "source_id"])
    .index("by_posted_at", ["posted_at"])
    .index("by_source", ["source"]),

  notes: defineTable({
    userId: v.id("users"),
    skill: v.string(),
    category: v.string(),
    content: v.string(),
    updated_at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_skill", ["userId", "skill"])
    .index("by_user_and_skill_and_category", ["userId", "skill", "category"]),

  milestones: defineTable({
    userId: v.id("users"),
    skill: v.string(),
    text: v.string(),
    done: v.boolean(),
    order: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_skill", ["userId", "skill"])
    .index("by_user_and_skill_and_order", ["userId", "skill", "order"]),

  proficiency: defineTable({
    userId: v.id("users"),
    skill: v.string(),
    level: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_skill", ["userId", "skill"]),

  plans: defineTable({
    userId: v.id("users"),
    title: v.string(),
    skill: v.optional(v.string()),
    target: v.optional(v.string()),
    done: v.boolean(),
    pinned: v.boolean(),
    created_at: v.number(),
    priority: v.optional(v.string()),
    due: v.optional(v.string()),
    notes: v.optional(v.string()),
    completed_at: v.optional(v.number()),
    status: v.optional(v.string()),
    order: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_skill", ["userId", "skill"])
    .index("by_user_and_order", ["userId", "order"]),

  resources: defineTable({
    userId: v.id("users"),
    skill: v.string(),
    title: v.string(),
    url: v.string(),
    kind: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_skill", ["userId", "skill"])
    .index("by_user_and_kind", ["userId", "kind"]),

  // Jobs themselves are still served by FastAPI (SQLite). Applications
  // denormalize the snapshot of job fields needed for the apply tracker
  // UI so reads don't need a cross-system join. `job_external_id` is the
  // FastAPI Job.id used as the dedupe key.
  applications: defineTable({
    userId: v.id("users"),
    job_external_id: v.string(),
    job_title: v.string(),
    job_company: v.optional(v.string()),
    job_source: v.optional(v.string()),
    job_source_url: v.optional(v.string()),
    job_posted_at: v.optional(v.string()),
    status: v.string(),
    applied_at: v.number(),
    notes: v.optional(v.string()),
    follow_up_at: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_job_ext", ["userId", "job_external_id"])
    .index("by_user_and_applied_at", ["userId", "applied_at"]),

  // Single row per user. Full Profile shape stored as JSON for now —
  // personal/education/experience/projects/skills/languages/certifications.
  // Validated at the application layer.
  profile: defineTable({
    userId: v.id("users"),
    data_json: v.string(),
    updated_at: v.number(),
    onboarded: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  // Per-user job actions: hide / save. Keyed by (userId, job_external_id).
  // Distinct from applications (which carries status transitions).
  job_actions: defineTable({
    userId: v.id("users"),
    job_external_id: v.string(),
    action: v.string(),
    updated_at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_action", ["userId", "action"])
    .index("by_user_and_job_ext", ["userId", "job_external_id"]),

  cv_drafts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    markdown: v.string(),
    updated_at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_updated_at", ["userId", "updated_at"]),

  // Chat history for /assistant + /interview. Conversations live per
  // user; messages denormalize userId for cheap isolation checks at
  // the read side without joining.
  conversations: defineTable({
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    meta_json: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_updated_at", ["userId", "updated_at"])
    .index("by_user_and_type", ["userId", "type"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    role: v.string(),
    content: v.string(),
    meta_json: v.optional(v.string()),
    created_at: v.number(),
  })
    .index("by_conv", ["conversationId"])
    .index("by_user", ["userId"]),

  // Excalidraw canvases. `slug` is the page identifier — "main" for
  // the standalone /excalidraw page, "skill:<skill>" for in-skill
  // sketches. Single row per (user, slug). Body is the full scene blob
  // as a JSON string so we don't fight schema drift in Excalidraw.
  sketches: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    data_json: v.string(),
    updated_at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_slug", ["userId", "slug"]),

  // Per-user secrets. Strings are expected to be encrypted at the
  // application layer (sealed by a key kept in Convex env) before insert.
  user_settings: defineTable({
    userId: v.id("users"),
    groq_key_encrypted: v.optional(v.string()),
    gemini_key_encrypted: v.optional(v.string()),
    openrouter_key_encrypted: v.optional(v.string()),
    openrouter_model: v.optional(v.string()),
    telegram_token_encrypted: v.optional(v.string()),
    telegram_chat_id: v.optional(v.string()),
    telegram_webhook_secret: v.optional(v.string()),
    scrape_filters: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_webhook_secret", ["telegram_webhook_secret"]),
});
