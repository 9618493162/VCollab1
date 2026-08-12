import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

async function hostRoom(t: TestClient) {
  const hostId = await insertUser(t, "host@example.com", "Host");
  const host = t.withIdentity({ subject: hostId });
  const code = await host.mutation(api.rooms.createRoom);
  return { hostId, host, code };
}

const twoPoints = [
  { x: 100, y: 100 },
  { x: 200, y: 200 },
];

describe("whiteboard (Phase 56)", () => {
  it("saves strokes with valid data and rejects bad ones", async () => {
    const t = makeTestClient();
    const { code } = await hostRoom(t);

    await t.mutation(api.whiteboard.saveStroke, {
      code,
      clientId: "c1",
      name: "  Alice  ",
      color: "#34d399",
      width: 4,
      highlighter: false,
      points: twoPoints,
    });
    const strokes = await t.query(api.whiteboard.listStrokes, { code });
    expect(strokes).toHaveLength(1);
    expect(strokes[0].name).toBe("Alice");
    expect(strokes[0].color).toBe("#34d399");
    expect(strokes[0].points).toEqual(twoPoints);

    await expect(
      t.mutation(api.whiteboard.saveStroke, {
        code,
        clientId: "c2",
        name: "Bob",
        color: "#ffffff",
        width: 3,
        highlighter: false,
        points: [{ x: 10, y: 10 }],
      }),
    ).rejects.toThrow("at least two points");

    await expect(
      t.mutation(api.whiteboard.saveStroke, {
        code,
        clientId: "",
        name: "Ghost",
        color: "#ffffff",
        width: 3,
        highlighter: false,
        points: twoPoints,
      }),
    ).rejects.toThrow("Join the meeting");

    await expect(
      t.mutation(api.whiteboard.saveStroke, {
        code,
        clientId: "c3",
        name: "Carol",
        color: "white",
        width: 3,
        highlighter: false,
        points: twoPoints,
      }),
    ).rejects.toThrow("Invalid color");
  });

  it("clips out-of-bounds points and keeps boards per-meeting", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const otherCode = await host.mutation(api.rooms.createRoom);

    await t.mutation(api.whiteboard.saveStroke, {
      code,
      clientId: "c1",
      name: "Alice",
      color: "#ffffff",
      width: 3,
      highlighter: false,
      points: [
        { x: -50, y: 100 },
        { x: 100, y: 150 },
        { x: 500, y: 300 },
        { x: 5000, y: 9000 },
      ],
    });

    const mine = await t.query(api.whiteboard.listStrokes, { code });
    expect(mine).toHaveLength(1);
    expect(mine[0].points).toEqual([
      { x: 100, y: 150 },
      { x: 500, y: 300 },
    ]);

    expect(await t.query(api.whiteboard.listStrokes, { code: otherCode })).toEqual([]);
  });

  it("only the author or the host can delete a stroke", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    await t.mutation(api.whiteboard.saveStroke, {
      code,
      clientId: "c1",
      name: "Alice",
      color: "#ffffff",
      width: 3,
      highlighter: false,
      points: twoPoints,
    });
    const strokeId = (await t.query(api.whiteboard.listStrokes, { code }))[0]._id;

    // another participant can't remove it
    await expect(
      t.mutation(api.whiteboard.deleteStroke, { code, strokeId, clientId: "c2" }),
    ).rejects.toThrow("Only the author or the host");

    // the author can
    await t.mutation(api.whiteboard.deleteStroke, { code, strokeId, clientId: "c1" });
    expect(await t.query(api.whiteboard.listStrokes, { code })).toHaveLength(0);

    // host can remove anyone's
    await t.mutation(api.whiteboard.saveStroke, {
      code,
      clientId: "c3",
      name: "Carol",
      color: "#f87171",
      width: 2,
      highlighter: true,
      points: twoPoints,
    });
    const hostStrokeId = (await t.query(api.whiteboard.listStrokes, { code }))[0]._id;
    await host.mutation(api.whiteboard.deleteStroke, { code, strokeId: hostStrokeId, clientId: "host-client" });
    expect(await t.query(api.whiteboard.listStrokes, { code })).toHaveLength(0);
  });

  it("only the host can clear the board", async () => {
    const t = makeTestClient();
    const { host, code } = await hostRoom(t);
    const otherId = await insertUser(t, "other@example.com", "Other");
    const other = t.withIdentity({ subject: otherId });

    await t.mutation(api.whiteboard.saveStroke, {
      code,
      clientId: "c1",
      name: "Alice",
      color: "#ffffff",
      width: 3,
      highlighter: false,
      points: twoPoints,
    });

    await expect(
      other.mutation(api.whiteboard.clearWhiteboard, { code }),
    ).rejects.toThrow("Only the host can clear");

    await host.mutation(api.whiteboard.clearWhiteboard, { code });
    expect(await t.query(api.whiteboard.listStrokes, { code })).toHaveLength(0);
  });
});
