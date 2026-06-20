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

test("applications are isolated per user", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.applications.apply, {
    job_external_id: "j1001",
    job_title: "Senior Eng",
    job_company: "Acme",
    job_source: "remoteok",
    job_source_url: "https://example.com/1001",
  });
  await bCtx.mutation(api.applications.apply, {
    job_external_id: "j1002",
    job_title: "Staff Eng",
    job_company: "Beta",
    job_source: "hn",
    job_source_url: "https://example.com/1002",
  });

  const aList = await aCtx.query(api.applications.list);
  const bList = await bCtx.query(api.applications.list);

  expect(aList).toHaveLength(1);
  expect(bList).toHaveLength(1);
  expect(aList[0].job.title).toBe("Senior Eng");
  expect(bList[0].job.title).toBe("Staff Eng");
});

test("user B cannot update or delete user A's application", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  const { id } = await aCtx.mutation(api.applications.apply, {
    job_external_id: "j2001",
    job_title: "Locked",
  });

  await expect(
    bCtx.mutation(api.applications.update, { id, status: "rejected" }),
  ).rejects.toThrow(/NOT_FOUND/);
  await expect(
    bCtx.mutation(api.applications.remove, { id }),
  ).rejects.toThrow(/NOT_FOUND/);

  const aStill = await aCtx.query(api.applications.list);
  expect(aStill).toHaveLength(1);
  expect(aStill[0].status).toBe("applied");
});

test("apply is idempotent per (user, job_external_id)", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const aCtx = t.withIdentity(asIdentity(a));

  const first = await aCtx.mutation(api.applications.apply, {
    job_external_id: "j3001",
    job_title: "Once",
  });
  const second = await aCtx.mutation(api.applications.apply, {
    job_external_id: "j3001",
    job_title: "Once",
  });

  expect(first.duplicated).toBe(false);
  expect(second.duplicated).toBe(true);
  const list = await aCtx.query(api.applications.list);
  expect(list).toHaveLength(1);
});

test("user_settings: presence booleans + isolation", async () => {
  // Provide a SECRETS_KEY for sealing during the test if not set.
  if (!process.env.SECRETS_KEY) {
    process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
  }
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  await aCtx.mutation(api.userSettings.setGroqKey, { key: "groq-secret-A" });
  await aCtx.mutation(api.userSettings.setScrapeFilters, { filters: "react,node" });
  await bCtx.mutation(api.userSettings.setTelegramToken, { token: "tg-B" });

  const aGet = await aCtx.query(api.userSettings.get);
  const bGet = await bCtx.query(api.userSettings.get);

  expect(aGet.has_groq_key).toBe(true);
  expect(aGet.has_telegram_token).toBe(false);
  expect(aGet.scrape_filters).toBe("react,node");

  expect(bGet.has_groq_key).toBe(false);
  expect(bGet.has_telegram_token).toBe(true);
  expect(bGet.scrape_filters).toBeNull();

  // Frontend-visible blob shape never leaks ciphertext.
  expect(aGet).not.toHaveProperty("groq_key_encrypted");
});

test("conversations: per-user isolation + message ownership", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const b = await makeUser(t, "b@test.local");
  const aCtx = t.withIdentity(asIdentity(a));
  const bCtx = t.withIdentity(asIdentity(b));

  const aConv = await aCtx.mutation(api.conversations.create, {
    type: "assistant",
    title: "A's chat",
  });
  await bCtx.mutation(api.conversations.create, {
    type: "assistant",
    title: "B's chat",
  });

  await aCtx.mutation(api.conversations.addMessage, {
    conversationId: aConv.id,
    role: "user",
    content: "hi",
  });

  // B cannot see A's conversation in list
  const bList = await bCtx.query(api.conversations.list, { type: "assistant" });
  expect(bList).toHaveLength(1);
  expect(bList[0].title).toBe("B's chat");

  // B cannot get A's conversation
  const stolen = await bCtx.query(api.conversations.get, { id: aConv.id });
  expect(stolen).toBeNull();

  // B cannot add to / rename / remove A's conversation
  await expect(
    bCtx.mutation(api.conversations.addMessage, {
      conversationId: aConv.id,
      role: "user",
      content: "evil",
    }),
  ).rejects.toThrow(/NOT_FOUND/);
  await expect(
    bCtx.mutation(api.conversations.rename, { id: aConv.id, title: "hijack" }),
  ).rejects.toThrow(/NOT_FOUND/);
  await expect(
    bCtx.mutation(api.conversations.remove, { id: aConv.id }),
  ).rejects.toThrow(/NOT_FOUND/);

  // A still has only their msg, and the conversation is intact
  const aRead = await aCtx.query(api.conversations.get, { id: aConv.id });
  expect(aRead?.title).toBe("A's chat");
  expect(aRead?.messages).toHaveLength(1);
});

test("conversations.remove cascades to messages", async () => {
  const t = convexTest(schema, modules);
  const a = await makeUser(t, "a@test.local");
  const aCtx = t.withIdentity(asIdentity(a));

  const conv = await aCtx.mutation(api.conversations.create, {
    type: "interview",
    title: "drop me",
  });
  await aCtx.mutation(api.conversations.addMessage, {
    conversationId: conv.id,
    role: "user",
    content: "x",
  });
  await aCtx.mutation(api.conversations.addMessage, {
    conversationId: conv.id,
    role: "assistant",
    content: "y",
  });

  await aCtx.mutation(api.conversations.remove, { id: conv.id });
  const list = await aCtx.query(api.conversations.list, { type: "interview" });
  expect(list).toHaveLength(0);
  const orphans = await t.run(async (ctx) =>
    ctx.db.query("messages").collect(),
  );
  expect(orphans).toHaveLength(0);
});

test("unauthenticated queries return empty/default, mutations throw", async () => {
  const t = convexTest(schema, modules);

  expect(await t.query(api.notes.get, { skill: "Python" })).toBeNull();
  expect(await t.query(api.milestones.listBySkill, { skill: "Python" })).toEqual([]);
  expect(await t.query(api.plans.list)).toEqual([]);
  expect(await t.query(api.resources.listBySkill, { skill: "Python" })).toEqual([]);
  expect(await t.query(api.proficiency.list)).toEqual([]);
  expect(await t.query(api.applications.list)).toEqual([]);
  expect(await t.query(api.userSettings.get)).toEqual({
    has_groq_key: false,
    has_telegram_token: false,
    scrape_filters: null,
  });

  await expect(t.mutation(api.notes.save, { skill: "Python", content: "x" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.milestones.add, { skill: "X", text: "y" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.plans.add, { title: "p" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(
    t.mutation(api.applications.apply, { job_external_id: "j1", job_title: "x" }),
  ).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(
    t.mutation(api.userSettings.setGroqKey, { key: "x" }),
  ).rejects.toThrow(/UNAUTHENTICATED/);
});
