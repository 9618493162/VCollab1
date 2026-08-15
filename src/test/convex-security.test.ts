import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

async function hostRoom(t: TestClient) {
  const hostId = await insertUser(t, "host@example.com", "Host");
  const host = t.withIdentity({ subject: hostId });
  const code = await host.mutation(api.rooms.createRoom);
  return { hostId, host, code };
}

describe("meeting security + waiting room (Meeting Room)", () => {
  it("only the host can change security settings", async () => {
    const t = makeTestClient();
    const otherId = await insertUser(t, "other@example.com", "Other");
    const other = t.withIdentity({ subject: otherId });
    const { code } = await hostRoom(t);

    await expect(
      other.mutation(api.security.updateMeetingSettings, { code, allowChat: false }),
    ).rejects.toThrow("Only the host can do that");
  });

  it("waiting room holds non-hosts until admitted; the host walks straight in", async () => {
    const t = makeTestClient();
    const { hostId, host, code } = await hostRoom(t);

    await host.mutation(api.security.updateMeetingSettings, { code, waitingRoom: true });

    // the host is never held
    const hostJoin = await host.mutation(api.call.joinRoom, {
      code,
      clientId: "host-c1",
      name: "Host",
      userId: hostId,
    });
    expect(hostJoin.waiting).toBe(false);

    // a guest is held
    const guestId = await insertUser(t, "guest@example.com", "Guest");
    const guest = t.withIdentity({ subject: guestId });
    const guestJoin = await guest.mutation(api.call.joinRoom, {
      code,
      clientId: "guest-c1",
      name: "Guest",
      userId: guestId,
    });
    expect(guestJoin.waiting).toBe(true);

    // the host sees them in the waiting list
    const waiting = await host.query(api.security.listWaitingParticipants, { code });
    expect(waiting).toHaveLength(1);
    expect(waiting[0].name).toBe("Guest");

    // admit → they stop appearing as waiting and show up in the participants list
    await host.mutation(api.security.admitParticipant, { code, clientId: "guest-c1" });
    expect(await host.query(api.security.listWaitingParticipants, { code })).toHaveLength(0);
    const participants = await host.query(api.call.listParticipants, { code });
    expect(participants.some((p) => p.clientId === "guest-c1" && p.waiting === false)).toBe(true);
  });

  it("admit all clears the whole waiting room", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    await host.mutation(api.security.updateMeetingSettings, { code, waitingRoom: true });

    for (const [clientId, name] of [
      ["w1", "One"],
      ["w2", "Two"],
    ] as const) {
      await t.run((ctx) =>
        ctx.db.insert("presence", {
          code,
          clientId,
          name,
          joinedAt: Date.now(),
          lastSeen: Date.now(),
          waiting: true,
        }),
      );
    }
    await host.mutation(api.security.admitAllWaiting, { code });
    expect(await host.query(api.security.listWaitingParticipants, { code })).toHaveLength(0);
  });

  it("rejecting a waiting participant removes them and kicks their client", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);

    await t.run((ctx) =>
      ctx.db.insert("presence", {
        code,
        clientId: "w1",
        name: "Wait",
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        waiting: true,
      }),
    );

    await host.mutation(api.security.rejectParticipant, { code, clientId: "w1" });
    expect(await host.query(api.security.listWaitingParticipants, { code })).toHaveLength(0);

    const signals = await t.query(api.call.listSignals, {
      code,
      to: "w1",
    });
    expect(signals.some((s) => s.kind === "kick")).toBe(true);
  });

  it("host can promote a participant to co-host, who then gains moderation powers", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const coHostId = await insertUser(t, "cohost@example.com", "CoHost");
    const coHost = t.withIdentity({ subject: coHostId });

    // co-host is actually in the meeting
    await t.run((ctx) =>
      ctx.db.insert("presence", {
        code,
        clientId: "c2",
        name: "CoHost",
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        userId: coHostId,
      }),
    );

    // before promotion, they can't mute everyone
    await expect(
      coHost.mutation(api.security.muteAll, { code, clientId: "c2" }),
    ).rejects.toThrow("Only the host or a co-host can do that");

    await host.mutation(api.security.makeCoHost, { code, clientId: "c2" });
    const settings = await t.query(api.security.getMeetingSettings, { code });
    expect(settings?.coHosts).toContain("c2");

    // now they can: muteAll writes a mute signal for everyone
    await coHost.mutation(api.security.muteAll, { code, clientId: "c2" });
    const signals = await t.query(api.call.listSignals, {
      code,
      to: "*",
    });
    expect(signals.some((s) => s.kind === "mute")).toBe(true);
  });

  it("only the host can promote co-hosts", async () => {
    const t = makeTestClient();
    const otherId = await insertUser(t, "other@example.com", "Other");
    const other = t.withIdentity({ subject: otherId });
    const { code } = await hostRoom(t);

    await expect(
      other.mutation(api.security.makeCoHost, { code, clientId: "c9" }),
    ).rejects.toThrow("Only the host can do that");
  });

  it("the waiting list returns [] for guests and non-hosts instead of throwing (guest join path)", async () => {
    const t = makeTestClient();
    const { code } = await hostRoom(t);

    // The meeting page subscribes to this query for every participant, guests
    // included — it must never error for them.
    const otherId = await insertUser(t, "other@example.com", "Other");
    const other = t.withIdentity({ subject: otherId });
    expect(await other.query(api.security.listWaitingParticipants, { code })).toEqual([]);

    // Fully anonymous visitor (no sign-in at all)
    expect(await t.query(api.security.listWaitingParticipants, { code })).toEqual([]);
  });
});
