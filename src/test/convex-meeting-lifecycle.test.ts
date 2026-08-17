import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

async function makeRoom(t: TestClient) {
  const hostId = await insertUser(t, "host@example.com", "Host");
  const host = t.withIdentity({ subject: hostId });
  const code = await host.mutation(api.rooms.createRoom, {});
  const room = await t.query(api.rooms.getRoom, { code });
  if (room === null) throw new Error("room not created");
  return { hostId, host, code, room };
}

describe("meeting lifecycle (backend is the source of truth)", () => {
  it("creates a unique active room with a join token and expiration", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const host = t.withIdentity({ subject: hostId });

    const a = await host.mutation(api.rooms.createRoom, {});
    const b = await host.mutation(api.rooms.createRoom, {});
    expect(a).not.toBe(b); // codes are never reused

    const room = await t.query(api.rooms.getRoom, { code: a });
    expect(room?.status).toBe("active");
    expect(room?.joinToken).toBeTruthy();
    expect(room?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects joins for an ended meeting and keeps it in history", async () => {
    const t = makeTestClient();
    const { host, code, room } = await makeRoom(t);
    const guestId = await insertUser(t, "guest@example.com", "Guest");
    const guest = t.withIdentity({ subject: guestId });

    // join by code works while live
    await expect(
      t.mutation(api.call.joinRoom, {
        code,
        clientId: "c1",
        name: "Guest",
        userId: guestId,
      }),
    ).resolves.toMatchObject({ waiting: false });

    // a saved link carries the token — wrong token is rejected
    await expect(
      t.mutation(api.call.joinRoom, {
        code,
        clientId: "c2",
        name: "Evil",
        token: "t_wrong",
      }),
    ).rejects.toThrow("meeting link is no longer valid");

    // the real token from the link still works
    await expect(
      t.mutation(api.call.joinRoom, {
        code,
        clientId: "c3",
        name: "Guest2",
        token: room.joinToken,
      }),
    ).resolves.toMatchObject({ waiting: false });

    // host ends the meeting for everyone
    await host.mutation(api.meetings.endMeeting, { code });
    const ended = await t.query(api.rooms.getRoom, { code });
    expect(ended?.status).toBe("ended");
    expect(ended?.endedAt).toBeTruthy();
    expect(ended?.joinToken).toBeUndefined(); // revoked
    expect(ended?.expiresAt).toBeLessThanOrEqual(Date.now()); // expired immediately

    // old code rejected
    await expect(
      t.mutation(api.call.joinRoom, { code, clientId: "c4", name: "Late" }),
    ).rejects.toThrow("This meeting has ended");

    // old link (even with the old token) rejected
    await expect(
      t.mutation(api.call.joinRoom, {
        code,
        clientId: "c5",
        name: "Late",
        token: room.joinToken,
      }),
    ).rejects.toThrow(/ended|no longer valid/);

    // history is retained, marked ended
    const history = await host.query(api.meetings.listHistory, {});
    expect(history.some((r) => r.code === code && r.status === "ended")).toBe(true);
  });

  it("auto-expires abandoned meetings past their expiresAt", async () => {
    const t = makeTestClient();
    const { host, code } = await makeRoom(t);
    const guestId = await insertUser(t, "guest@example.com", "Guest");

    // someone joins, then everyone disappears
    await t.mutation(api.call.joinRoom, {
      code,
      clientId: "c1",
      name: "Guest",
      userId: guestId,
    });

    // push the meeting past its deadline (as if the sweep was delayed)
    await t.run((ctx) =>
      ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first()
        .then((room) => room && ctx.db.patch(room._id, { expiresAt: Date.now() - 1 })),
    );

    // a join attempt is rejected immediately (even before the sweep runs)
    await expect(
      t.mutation(api.call.joinRoom, { code, clientId: "c9", name: "Late" }),
    ).rejects.toThrow("This meeting has expired");
    // getRoom surfaces the computed expired flag so the UI never shows the lobby
    const expired = await t.query(api.rooms.getRoom, { code });
    expect(expired?.expired).toBe(true);

    // the background sweep flips the stored status and clears stale presence
    const before = await t.query(api.call.listParticipants, { code });
    expect(before.length).toBeGreaterThan(0);
    await t.mutation(internal.meetings.expireStaleMeetings, {});
    const after = await t.query(api.call.listParticipants, { code });
    expect(after).toHaveLength(0);
    const swept = await t.query(api.rooms.getRoom, { code });
    expect(swept?.status).toBe("expired");
    expect(swept?.joinToken).toBeUndefined();

    // still in history for authorized users
    const history = await host.query(api.meetings.listHistory, {});
    expect(history.some((r) => r.code === code && r.status === "expired")).toBe(true);
  });

  it("transfers hosting: only the new host can end the meeting", async () => {
    const t = makeTestClient();
    const { host, code } = await makeRoom(t);
    const guestId = await insertUser(t, "guest@example.com", "Guest");
    const guest = t.withIdentity({ subject: guestId });

    await t.mutation(api.call.joinRoom, {
      code,
      clientId: "c1",
      name: "Guest",
      userId: guestId,
    });

    await host.mutation(api.meetings.transferHost, { code, targetUserId: guestId });

    // old host can no longer end it
    await expect(host.mutation(api.meetings.endMeeting, { code })).rejects.toThrow(
      "Only the host",
    );
    // new host can
    await guest.mutation(api.meetings.endMeeting, { code });
    expect((await t.query(api.rooms.getRoom, { code }))?.status).toBe("ended");
  });
});
