import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("users.currentUser (profile endpoint)", () => {
  it("returns null when signed out", async () => {
    const t = makeTestClient();
    expect(await t.query(api.users.currentUser)).toBeNull();
  });

  it("returns the real profile for an authenticated user", async () => {
    const t = makeTestClient();
    const meId = await insertUser(t, "me@example.com", "Myself");
    const me = t.withIdentity({ subject: meId });

    const profile = await me.query(api.users.currentUser);
    expect(profile).not.toBeNull();
    expect(profile).toMatchObject({
      _id: meId,
      name: "Myself",
      email: "me@example.com",
      isAnonymous: false,
    });
  });

  it("reflects profile updates immediately (real round-trip)", async () => {
    const t = makeTestClient();
    const meId = await insertUser(t, "me@example.com", "Myself");
    const me = t.withIdentity({ subject: meId });

    await me.mutation(api.settings.updateProfile, { name: "  Nav   Deep  " });
    const profile = await me.query(api.users.currentUser);
    expect(profile?.name).toBe("Nav Deep");
  });
});

describe("users.emailExists (duplicate-account protection)", () => {
  it("is false for unknown emails", async () => {
    const t = makeTestClient();
    expect(
      await t.query(api.users.emailExists, { email: "nobody@example.com" }),
    ).toBe(false);
  });

  it("is true for a registered account, case-insensitive", async () => {
    const t = makeTestClient();
    await insertUser(t, "alice@example.com", "Alice");
    expect(
      await t.query(api.users.emailExists, { email: "ALICE@example.com" }),
    ).toBe(true);
  });

  it("ignores anonymous guest rows", async () => {
    const t = makeTestClient();
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Guest",
        email: "guest@example.com",
        isAnonymous: true,
      }),
    );
    expect(
      await t.query(api.users.emailExists, { email: "guest@example.com" }),
    ).toBe(false);
  });

  it("rejects invalid input without erroring", async () => {
    const t = makeTestClient();
    expect(await t.query(api.users.emailExists, { email: "not-an-email" })).toBe(
      false,
    );
    expect(await t.query(api.users.emailExists, { email: "   " })).toBe(false);
  });
});

describe("auth-gated user queries (protection)", () => {
  it("searchUsers and getUsersByEmails return nothing when signed out", async () => {
    const t = makeTestClient();
    await insertUser(t, "alice@example.com", "Alice");
    expect(await t.query(api.users.searchUsers, { query: "alice" })).toEqual([]);
    expect(
      await t.query(api.users.getUsersByEmails, { emails: ["alice@example.com"] }),
    ).toEqual([]);
  });
});
