import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
  "../**/*.ts",
);

async function makeUser(t: ReturnType<typeof convexTest>, email: string) {
  return (await t.run(async (ctx) => ctx.db.insert("users", { email }))) as Id<"users">;
}
function asIdentity(userId: Id<"users">) {
  return { subject: `${userId}|session_${userId}`, issuer: "test" };
}

test("profile.save mirrors skills into proficiency table", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@x.local");
  const aCtx = t.withIdentity(asIdentity(a));

  await aCtx.mutation(api.profile.save, {
    data: JSON.stringify({
      personal: { name: "A" },
      skills: { Python: 4, React: 3, "Node.js": 2 },
    }),
  });

  const rows = await aCtx.query(api.proficiency.list);
  const map = Object.fromEntries(rows.map((r) => [r.skill, r.level]));
  expect(map).toEqual({ Python: 4, React: 3, "Node.js": 2 });
});

test("profile.save does NOT clobber user-edited proficiency levels", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@x.local");
  const aCtx = t.withIdentity(asIdentity(a));

  // User edits proficiency directly first.
  await aCtx.mutation(api.proficiency.setLevel, { skill: "Python", level: 5 });

  // Then a CV re-parse saves profile with Python at level 2 (parser default).
  await aCtx.mutation(api.profile.save, {
    data: JSON.stringify({ skills: { Python: 2, React: 3 } }),
  });

  const rows = await aCtx.query(api.proficiency.list);
  const map = Object.fromEntries(rows.map((r) => [r.skill, r.level]));
  // Python stays at 5 (user choice wins); React inserted at parsed level.
  expect(map).toEqual({ Python: 5, React: 3 });
});

test("jobs.list falls back to profile.skills when proficiency empty", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@x.local");
  const aCtx = t.withIdentity(asIdentity(a));

  // Seed a profile row directly (skip the sync mutation) to simulate
  // an existing user whose proficiency table has not been populated.
  await t.run(async (ctx) =>
    ctx.db.insert("profile", {
      userId: a,
      data_json: JSON.stringify({ skills: { Python: 4 } }),
      updated_at: Date.now(),
    }),
  );

  // Seed a job that mentions Python.
  await t.run(async (ctx) =>
    ctx.db.insert("jobs_pool", {
      source: "test",
      source_id: "1",
      source_url: "https://x/1",
      title: "Junior Python Engineer",
      description: "We use Python and FastAPI",
      fetched_at: Date.now(),
    }),
  );

  const res = await aCtx.query(api.jobs.list, { min_score: 0 });
  expect(res.items.length).toBe(1);
  expect(res.items[0].score).toBeGreaterThan(20);
});

test("jobs.list reads proficiency when populated", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@x.local");
  const aCtx = t.withIdentity(asIdentity(a));

  await aCtx.mutation(api.proficiency.setLevel, { skill: "Rust", level: 4 });
  await t.run(async (ctx) =>
    ctx.db.insert("jobs_pool", {
      source: "test",
      source_id: "1",
      source_url: "https://x/1",
      title: "Rust Backend Engineer",
      description: "Rust async services",
      fetched_at: Date.now(),
    }),
  );

  const res = await aCtx.query(api.jobs.list, { min_score: 0 });
  expect(res.items[0].skills.some((s) => s.skill === "Rust")).toBe(true);
});
