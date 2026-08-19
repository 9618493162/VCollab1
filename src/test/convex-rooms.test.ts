import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { generateRoomCode, normalizeCode } from "../convex/rooms";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("room codes", () => {
  it("generates well-formed codes", () => {
    const code = generateRoomCode();
    // VC-XXXXXX format: uppercase letters A-Z + digits 2-9 (no 0,1,I,L,O)
    expect(code).toMatch(/^VC-[A-HJKMNP-Z2-9]{6}$/);
    expect(generateRoomCode()).not.toBe(generateRoomCode());
  });

  it("normalizes messy input and rejects too-short codes", () => {
    // New format: VC-XXXXXX
    expect(normalizeCode("VC-7K4P9X")).toBe("VC-7K4P9X");
    expect(normalizeCode("vc-7k4p9x")).toBe("VC-7K4P9X");
    expect(normalizeCode("VC7K4P9X")).toBe("VC-7K4P9X");
    // Legacy format still normalizes
    expect(normalizeCode("ABC-DEFG-HIJ")).toBe("abc-defg-hij");
    expect(normalizeCode("abcdefghij")).toBe("abc-defg-hij");
    // Too short
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
    expect(code).toMatch(/^VC-[A-HJKMNP-Z2-9]{6}$/);

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
