import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { generateRoomCode, normalizeCode } from "../convex/rooms";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("room codes", () => {
  it("generates well-formed codes", () => {
    const code = generateRoomCode();
    // 3-4-3 lowercase letters from the unambiguous alphabet (no i/l/o)
    expect(code).toMatch(/^[a-hjkmnp-z]{3}-[a-hjkmnp-z]{4}-[a-hjkmnp-z]{3}$/);
    expect(generateRoomCode()).not.toBe(generateRoomCode());
  });

  it("normalizes messy input and rejects too-short codes", () => {
    expect(normalizeCode("ABC-DEFG-HIJ")).toBe("abc-defg-hij");
    expect(normalizeCode("abcdefghij")).toBe("abc-defg-hij");
    expect(normalizeCode("abc")).toBe("");
    expect(normalizeCode("")).toBe("");
  });
});

describe("meeting room flow (create → lookup → rename)", () => {
  it("requires auth to create a room", async () => {
    const t = makeTestClient();
    await expect(t.mutation(api.rooms.createRoom)).rejects.toThrow(
      "Sign in to start a meeting",
    );
  });

  it("creates a room for a signed-in user and lets only the host rename it", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const otherId = await insertUser(t, "other@example.com", "Other");

    const host = t.withIdentity({ subject: hostId });
    const other = t.withIdentity({ subject: otherId });

    const code = await host.mutation(api.rooms.createRoom);
    expect(code).toMatch(/^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/);

    const room = await t.query(api.rooms.getRoom, { code });
    expect(room).not.toBeNull();
    expect(room!.createdBy).toBe(hostId);
    expect(room!.title).toBeUndefined();

    await host.mutation(api.rooms.renameRoom, { code, title: "  Sprint sync  " });
    const renamed = await t.query(api.rooms.getRoom, { code });
    expect(renamed!.title).toBe("Sprint sync");

    await expect(
      other.mutation(api.rooms.renameRoom, { code, title: "Nope" }),
    ).rejects.toThrow("Only the host can rename this meeting.");

    // my rooms lists only what this user created
    const mine = await host.query(api.rooms.listMyRooms);
    expect(mine).toHaveLength(1);
    expect(mine[0].code).toBe(code);
  });
});
