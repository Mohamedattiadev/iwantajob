import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Schema for IWANTAJOB. Every domain table is per-user — `userId` is required
// and indexed. `authTables` provides the `users`, `accounts`, etc. that
// @convex-dev/auth manages; do not redefine `users` here.
export default defineSchema({
  ...authTables,

  jobs: defineTable({
    userId: v.id("users"),
    title: v.string(),
    company: v.string(),
    location: v.optional(v.string()),
    source: v.string(),
    source_url: v.string(),
    score: v.optional(v.number()),
    status: v.optional(v.string()),
    posted_at: v.optional(v.string()),
    raw: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_posted_at", ["userId", "posted_at"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_source_url", ["userId", "source_url"]),

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

  applications: defineTable({
    userId: v.id("users"),
    job_id: v.id("jobs"),
    status: v.string(),
    applied_at: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_job", ["userId", "job_id"])
    .index("by_user_and_applied_at", ["userId", "applied_at"]),

  // Single row per user. Enforced by querying via the `by_user` index and
  // patching the first hit on writes.
  profile: defineTable({
    userId: v.id("users"),
    name: v.optional(v.string()),
    headline: v.optional(v.string()),
    summary: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
  }).index("by_user", ["userId"]),

  cv_drafts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    markdown: v.string(),
    updated_at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_updated_at", ["userId", "updated_at"]),

  // Per-user secrets. Strings are expected to be encrypted at the
  // application layer (sealed by a key kept in Convex env) before insert.
  user_settings: defineTable({
    userId: v.id("users"),
    groq_key_encrypted: v.optional(v.string()),
    telegram_token_encrypted: v.optional(v.string()),
    scrape_filters: v.optional(v.string()),
  }).index("by_user", ["userId"]),
});
