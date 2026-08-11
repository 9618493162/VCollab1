import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("users.searchUsers", () => {
  it("returns an empty list when signed out", async () => {
    const t = makeTestClient();
    expect(await t.query(api.users.searchUsers, { query: "alice" })).toEqual([]);
  });

  it("finds users by name or email, excluding self and guests", async () => {
    const t = makeTestClient();
    const meId = await insertUser(t, "me@example.com", "Myself");
    await insertUser(t, "alice@example.com", "Alice Lee");
    await insertUser(t, "bob@corp.io", "Bobby Tables");
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Ghost User",
        email: "ghost@example.com",
        isAnonymous: true,
      }),
    );

    const me = t.withIdentity({ subject: meId });

    // By name.
    const byName = await me.query(api.users.searchUsers, { query: "alice" });
    expect(byName.map((u) => u.name)).toEqual(["Alice Lee"]);

    // By email, case-insensitive substring.
    const byEmail = await me.query(api.users.searchUsers, { query: "CORP" });
    expect(byEmail.map((u) => u.email)).toEqual(["bob@corp.io"]);

    // Never returns yourself or guest accounts.
    const all = await me.query(api.users.searchUsers, { query: "example" });
    expect(all.map((u) => u.email)).not.toContain("me@example.com");
    expect(all.map((u) => u.email)).not.toContain("ghost@example.com");

    // Empty query returns nothing.
    expect(await me.query(api.users.searchUsers, { query: "  " })).toEqual([]);

    // No matches.
    expect(await me.query(api.users.searchUsers, { query: "zzz" })).toEqual([]);
  });
});

describe("users.getUsersByEmails", () => {
  it("resolves known emails to users and skips unknowns + guests", async () => {
    const t = makeTestClient();
    const meId = await insertUser(t, "me@example.com", "Myself");
    const aliceId = await insertUser(t, "alice@example.com", "Alice Lee");
    await insertUser(t, "bob@corp.io", "Bobby Tables");
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Ghost User",
        email: "ghost@example.com",
        isAnonymous: true,
      }),
    );

    const me = t.withIdentity({ subject: meId });

    const result = await me.query(api.users.getUsersByEmails, {
      emails: ["ALICE@example.com", "nobody@example.com", "ghost@example.com"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: aliceId,
      name: "Alice Lee",
      email: "alice@example.com",
    });

    // Unknown addresses are dropped, empty input returns nothing.
    expect(
      await me.query(api.users.getUsersByEmails, {
        emails: ["zzz@nowhere.com"],
      }),
    ).toEqual([]);
    expect(await me.query(api.users.getUsersByEmails, { emails: [] })).toEqual([]);

    // Signed-out callers get nothing.
    expect(
      await t.query(api.users.getUsersByEmails, {
        emails: ["alice@example.com"],
      }),
    ).toEqual([]);
  });
});
