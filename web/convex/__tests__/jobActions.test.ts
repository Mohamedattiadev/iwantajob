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

test("setAction saves + lists per-user", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@x.local");
  const b = await makeUser(t, "b@x.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.jobActions.setAction, { job_external_id: "j1", action: "saved" });
  await aCtx.mutation(api.jobActions.setAction, { job_external_id: "j2", action: "hidden" });

  const aList = await aCtx.query(api.jobActions.list);
  expect(new Set(aList.saved)).toEqual(new Set(["j1"]));
  expect(new Set(aList.hidden)).toEqual(new Set(["j2"]));

  // User B sees nothing.
  const bList = await bCtx.query(api.jobActions.list);
  expect(bList.saved).toEqual([]);
  expect(bList.hidden).toEqual([]);
});

test("setAction 'none' removes the row", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@x.local");
  const aCtx = t.withIdentity(asIdentity(a));

  await aCtx.mutation(api.jobActions.setAction, { job_external_id: "j1", action: "saved" });
  await aCtx.mutation(api.jobActions.setAction, { job_external_id: "j1", action: "none" });

  const list = await aCtx.query(api.jobActions.list);
  expect(list.saved).toEqual([]);
  expect(list.hidden).toEqual([]);
});

test("setAction toggles between saved and hidden in place", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@x.local");
  const aCtx = t.withIdentity(asIdentity(a));

  await aCtx.mutation(api.jobActions.setAction, { job_external_id: "j1", action: "saved" });
  await aCtx.mutation(api.jobActions.setAction, { job_external_id: "j1", action: "hidden" });

  const list = await aCtx.query(api.jobActions.list);
  expect(list.saved).toEqual([]);
  expect(list.hidden).toEqual(["j1"]);

  // Only one row should exist for this (user, job).
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("job_actions")
      .withIndex("by_user_and_job_ext", (q) => q.eq("userId", a).eq("job_external_id", "j1"))
      .collect(),
  );
  expect(rows.length).toBe(1);
});

test("setAction requires auth", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.jobActions.setAction, { job_external_id: "j1", action: "saved" }),
  ).rejects.toThrow(/UNAUTHENTICATED/);
});
