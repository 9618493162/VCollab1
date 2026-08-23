import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

async function hostRoom(t: TestClient) {
  const hostId = await insertUser(t, "host@example.com", "Host");
  const host = t.withIdentity({ subject: hostId });
  const code = await host.mutation(api.rooms.createRoom);
  return { hostId, host, code };
}

describe("breakout rooms (Phase 55)", () => {
  it("only the host can manage breakouts", async () => {
    const t = makeTestClient();
    const otherId = await insertUser(t, "other@example.com", "Other");
    const other = t.withIdentity({ subject: otherId });
    const { code } = await hostRoom(t);

    await expect(
      other.mutation(api.breakouts.createBreakout, { code, name: "Sneaky" }),
    ).rejects.toThrow("Only the host or a co-host can manage breakout rooms.");
  });

  it("creating the first room starts an active session and names rooms sequentially", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);

    const first = await host.mutation(api.breakouts.createBreakout, { code });
    const second = await host.mutation(api.breakouts.createBreakout, { code, name: "Design" });

    const data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.session?.active).toBe(true);
    expect(data.rooms).toHaveLength(2);
    expect(data.rooms[0]._id).toBe(first);
    expect(data.rooms[0].name).toBe("Room 1");
    expect(data.rooms[1]._id).toBe(second);
    expect(data.rooms[1].name).toBe("Design");
  });

  it("host assigns participants to rooms; each client is in at most one room", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const roomA = await host.mutation(api.breakouts.createBreakout, { code, name: "A" });
    const roomB = await host.mutation(api.breakouts.createBreakout, { code, name: "B" });

    // simulate two people in the call
    await t.run((ctx) =>
      ctx.db.insert("presence", {
        code,
        clientId: "c1",
        name: "Alice",
        joinedAt: Date.now(),
        lastSeen: Date.now(),
      }),
    );

    await host.mutation(api.breakouts.assignToBreakout, {
      code,
      roomId: roomA,
      clientId: "c1",
      name: "Alice",
    });
    let data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.rooms.find((r) => r._id === roomA)?.members).toEqual([
      { clientId: "c1", name: "Alice" },
    ]);
    expect(data.participants.find((p) => p.clientId === "c1")?.roomId).toBe(roomA);

    // moving someone replaces their old membership
    await host.mutation(api.breakouts.assignToBreakout, {
      code,
      roomId: roomB,
      clientId: "c1",
      name: "Alice",
    });
    data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.rooms.find((r) => r._id === roomA)?.members).toEqual([]);
    expect(data.rooms.find((r) => r._id === roomB)?.members).toHaveLength(1);

    // returning to main clears the assignment
    await host.mutation(api.breakouts.leaveBreakout, { code, clientId: "c1" });
    data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.participants.find((p) => p.clientId === "c1")?.roomId).toBeNull();
  });

  it("participants can join and leave rooms themselves", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const room = await host.mutation(api.breakouts.createBreakout, { code });

    await t.mutation(api.breakouts.joinBreakout, {
      code,
      roomId: room,
      clientId: "c7",
      name: "  Bob  ",
    });
    const data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.rooms[0].members).toEqual([{ clientId: "c7", name: "Bob" }]);

    await t.mutation(api.breakouts.leaveBreakout, { code, clientId: "c7" });
    expect((await t.query(api.breakouts.listBreakouts, { code })).rooms[0].members).toEqual([]);
  });

  it("the host can rename, delete, and timebox the session", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const room = await host.mutation(api.breakouts.createBreakout, { code });

    await host.mutation(api.breakouts.renameBreakout, { code, roomId: room, name: "Brainstorm" });
    expect((await t.query(api.breakouts.listBreakouts, { code })).rooms[0].name).toBe("Brainstorm");

    await host.mutation(api.breakouts.setBreakoutTimer, { code, minutes: 5 });
    let data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.session?.timerEndsAt).toBeGreaterThan(Date.now());

    await host.mutation(api.breakouts.clearBreakoutTimer, { code });
    data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.session?.timerEndsAt).toBeUndefined();

    await host.mutation(api.breakouts.deleteBreakout, { code, roomId: room });
    expect((await t.query(api.breakouts.listBreakouts, { code })).rooms).toHaveLength(0);
  });

  it("ending the session returns everyone to the main meeting", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const room = await host.mutation(api.breakouts.createBreakout, { code });
    await t.mutation(api.breakouts.joinBreakout, {
      code,
      roomId: room,
      clientId: "c1",
      name: "Alice",
    });

    await host.mutation(api.breakouts.endBreakoutSession, { code });
    let data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.session?.active).toBe(false);
    expect(data.rooms[0].members).toEqual([]);

    // starting again after an ended session opens a fresh one
    await host.mutation(api.breakouts.createBreakout, { code });
    data = await t.query(api.breakouts.listBreakouts, { code });
    expect(data.session?.active).toBe(true);
  });

  it("room chat is limited to members and the host", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const room = await host.mutation(api.breakouts.createBreakout, { code });

    await t.mutation(api.breakouts.joinBreakout, {
      code,
      roomId: room,
      clientId: "c1",
      name: "Alice",
    });
    await t.mutation(api.breakouts.sendBreakoutMessage, {
      code,
      roomId: room,
      clientId: "c1",
      name: "Alice",
      text: "  let's start  ",
    });

    // a stranger who isn't in the room can't post
    await expect(
      t.mutation(api.breakouts.sendBreakoutMessage, {
        code,
        roomId: room,
        clientId: "c9",
        name: "Stranger",
        text: "intruder",
      }),
    ).rejects.toThrow("not in this room");

    // the host can broadcast into any room
    await host.mutation(api.breakouts.sendBreakoutMessage, {
      code,
      roomId: room,
      clientId: "host-client",
      name: "Host",
      text: "two minutes left!",
    });

    const messages = await t.query(api.breakouts.listBreakoutMessages, { code, roomId: room });
    expect(messages.map((m) => m.text)).toEqual(["let's start", "two minutes left!"]);
  });
});
