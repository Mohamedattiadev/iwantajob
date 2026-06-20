import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Multi-tenant isolation: every domain table is userId-scoped. These
// tests use convex-test to seed two synthetic users and prove user B
// cannot read or mutate user A's rows.
//
// `convexTest` runs an in-memory Convex backend. `t.withIdentity(...)`
// fakes `ctx.auth.getUserIdentity()`, but we still need a real
// `Id<"users">` in the users table for `getAuthUserId` to resolve.

const modules = (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
  "../**/*.ts",
);

async function makeUser(t: ReturnType<typeof convexTest>, email: string) {
  const id = await t.run(async (ctx) => ctx.db.insert("users", { email }));
  return id as Id<"users">;
}

function asIdentity(userId: Id<"users">) {
  // @convex-dev/auth's `getAuthUserId` reads `identity.subject` and
  // splits on "|". Format: `<userId>|<sessionId>`.
  return { subject: `${userId}|session_${userId}`, issuer: "test" };
}

test("notes are isolated per user", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");

  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.notes.save, { skill: "Python", content: "# A's python notes" });
  await bCtx.mutation(api.notes.save, { skill: "Python", content: "# B's python notes" });

  const aRead = await aCtx.query(api.notes.get, { skill: "Python" });
  const bRead = await bCtx.query(api.notes.get, { skill: "Python" });

  expect(aRead?.content).toBe("# A's python notes");
  expect(bRead?.content).toBe("# B's python notes");
});

test("milestones are isolated per user", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.milestones.add, { skill: "React", text: "useState basics" });
  await aCtx.mutation(api.milestones.add, { skill: "React", text: "useEffect lifecycle" });
  await bCtx.mutation(api.milestones.add, { skill: "React", text: "B's only milestone" });

  const aList = await aCtx.query(api.milestones.listBySkill, { skill: "React" });
  const bList = await bCtx.query(api.milestones.listBySkill, { skill: "React" });

  expect(aList).toHaveLength(2);
  expect(bList).toHaveLength(1);
  expect(bList[0].text).toBe("B's only milestone");
});

test("user B cannot toggle user A's milestones", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.milestones.add, { skill: "Git", text: "Init repo" });
  const aList = await aCtx.query(api.milestones.listBySkill, { skill: "Git" });
  const id = aList[0]._id;

  await expect(bCtx.mutation(api.milestones.toggle, { id })).rejects.toThrow(/NOT_FOUND/);

  const stillFalse = (await aCtx.query(api.milestones.listBySkill, { skill: "Git" }))[0].done;
  expect(stillFalse).toBe(false);
});

test("plans are isolated per user", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.plans.add, { title: "Master React", skill: "React" });
  await bCtx.mutation(api.plans.add, { title: "Master Vue", skill: "Vue" });

  const aPlans = await aCtx.query(api.plans.list);
  const bPlans = await bCtx.query(api.plans.list);

  expect(aPlans).toHaveLength(1);
  expect(bPlans).toHaveLength(1);
  expect(aPlans[0].title).toBe("Master React");
  expect(bPlans[0].title).toBe("Master Vue");
});

test("resources are isolated per user + skill", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.resources.add, {
    skill: "Python",
    title: "PyDocs",
    url: "https://docs.python.org",
    kind: "docs",
  });
  const bSeesNone = await bCtx.query(api.resources.listBySkill, { skill: "Python" });
  expect(bSeesNone).toHaveLength(0);

  const aSees = await aCtx.query(api.resources.listBySkill, { skill: "Python" });
  expect(aSees).toHaveLength(1);
});

test("proficiency is isolated per user", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.proficiency.setLevel, { skill: "JavaScript", level: 4 });
  await bCtx.mutation(api.proficiency.setLevel, { skill: "JavaScript", level: 1 });

  const aLevels = await aCtx.query(api.proficiency.list);
  const bLevels = await bCtx.query(api.proficiency.list);
  expect(aLevels.find((p) => p.skill === "JavaScript")?.level).toBe(4);
  expect(bLevels.find((p) => p.skill === "JavaScript")?.level).toBe(1);
});

test("profile is isolated per user", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.profile.save, {
    data: JSON.stringify({
      personal: { name: "Alice", email: "a@test.local", phone: "", location: "", links: {}, summary: "" },
      education: [], experience: [], projects: [], skills: { Python: 4 }, languages: [], certifications: [],
    }),
  });

  const aProfile = await aCtx.query(api.profile.get);
  const bProfile = await bCtx.query(api.profile.get);

  expect(aProfile.personal.name).toBe("Alice");
  expect(bProfile.personal.name).toBe("");
});

test("unauthenticated queries return empty/default, mutations throw", async () => {
  const t = convexTest(schema, modules);

  expect(await t.query(api.notes.get, { skill: "Python" })).toBeNull();
  expect(await t.query(api.milestones.listBySkill, { skill: "Python" })).toEqual([]);
  expect(await t.query(api.plans.list)).toEqual([]);
  expect(await t.query(api.resources.listBySkill, { skill: "Python" })).toEqual([]);
  expect(await t.query(api.proficiency.list)).toEqual([]);

  await expect(t.mutation(api.notes.save, { skill: "Python", content: "x" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.milestones.add, { skill: "X", text: "y" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.plans.add, { title: "p" })).rejects.toThrow(/UNAUTHENTICATED/);
});
