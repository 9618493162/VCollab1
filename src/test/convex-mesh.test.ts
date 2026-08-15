import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

/**
 * Two-browser-tab simulation of the meeting mesh.
 *
 * The actual WebRTC media connection happens browser-to-browser; what Convex
 * coordinates is the *signaling* mesh: presence, hello/bye discovery,
 * offer/answer/ICE relay, chat, reactions, hand-raise and sharing state.
 * This test plays both tabs against the same backend the Call page talks to
 * (`api.call.*`), mirroring the handshake in src/hooks/use-call-room.ts so
 * the two sides converge exactly like two real tabs would.
 */

const TAB_A = "tab-a"; // host, signed in
const TAB_B = "tab-b"; // guest, opened the shared link while logged out
const TAB_C = "tab-c"; // a third tab (waiting room / refusal scenarios)

async function startMeeting(t: TestClient) {
  const hostId = await insertUser(t, "host@example.com", "Host");
  const host = t.withIdentity({ subject: hostId });
  const code = await host.mutation(api.rooms.createRoom);
  return { hostId, host, code };
}

function ofKind(
  signals: Array<{ kind: string; from: string }>,
  kind: string,
) {
  return signals.filter((s) => s.kind === kind);
}

describe("two-tab meeting mesh (host tab + guest tab on a shared link)", () => {
  it("converges: discovery, offer/answer/ice relay, participants, chat, reactions", async () => {
    const t = makeTestClient();
    const { hostId, host, code } = await startMeeting(t);

    // --- Tab A (host) opens the meeting first ---
    const aJoin = await host.mutation(api.call.joinRoom, {
      code,
      clientId: TAB_A,
      name: "Host",
      userId: hostId,
    });
    expect(aJoin.waiting).toBe(false);
    expect(aJoin.participants).toEqual([]); // alone at first

    // --- Tab B (guest) opens the shared link in a second tab ---
    // No identity at all: anonymous, like clicking a link while logged out.
    const bJoin = await t.mutation(api.call.joinRoom, {
      code,
      clientId: TAB_B,
      name: "Guest",
      userId: undefined,
    });
    expect(bJoin.waiting).toBe(false);
    // The guest is told who's already here so it can open connections to them.
    expect(bJoin.participants.map((p) => p.clientId)).toContain(TAB_A);

    // --- discovery: each tab receives the other's "hello" broadcast ---
    const aSignals1 = await t.query(api.call.listSignals, { code, to: TAB_A });
    const bSignals1 = await t.query(api.call.listSignals, { code, to: TAB_B });
    expect(ofKind(aSignals1, "hello").map((s) => s.from)).toContain(TAB_B);
    expect(ofKind(bSignals1, "hello").map((s) => s.from)).toContain(TAB_A);

    // --- mesh handshake, exactly as use-call-room does it ---
    // The lexicographically smaller clientId is the offerer, which avoids
    // glare: only one tab ever creates the offer.
    expect(TAB_A < TAB_B).toBe(true);
    await host.mutation(api.call.sendSignal, {
      code,
      from: TAB_A,
      to: TAB_B,
      kind: "offer",
      payload: JSON.stringify({ type: "offer", sdp: "sdp-a->b" }),
    });
    // both sides also trickle ICE candidates
    await host.mutation(api.call.sendSignal, {
      code,
      from: TAB_A,
      to: TAB_B,
      kind: "ice",
      payload: JSON.stringify({ candidate: "candidate-a" }),
    });
    await t.mutation(api.call.sendSignal, {
      code,
      from: TAB_B,
      to: TAB_A,
      kind: "ice",
      payload: JSON.stringify({ candidate: "candidate-b" }),
    });
    // answerer -> offerer: answer
    await t.mutation(api.call.sendSignal, {
      code,
      from: TAB_B,
      to: TAB_A,
      kind: "answer",
      payload: JSON.stringify({ type: "answer", sdp: "sdp-b->a" }),
    });

    // Both tabs now see the full signaling conversation addressed to them.
    const aSignals2 = await t.query(api.call.listSignals, { code, to: TAB_A });
    const bSignals2 = await t.query(api.call.listSignals, { code, to: TAB_B });
    expect(ofKind(bSignals2, "offer").map((s) => s.from)).toEqual([TAB_A]);
    expect(ofKind(aSignals2, "answer").map((s) => s.from)).toEqual([TAB_B]);
    expect(ofKind(aSignals2, "ice").map((s) => s.from)).toEqual([TAB_B]);
    expect(ofKind(bSignals2, "ice").map((s) => s.from)).toEqual([TAB_A]);
    // no glare: the guest never sends its own offer
    expect(ofKind(aSignals2, "offer")).toHaveLength(0);

    // --- participant lists converge on both sides ---
    const aPeers = await host.query(api.call.listParticipants, { code });
    const bPeers = await t.query(api.call.listParticipants, { code });
    expect(aPeers.map((p) => p.clientId).sort()).toEqual([TAB_A, TAB_B].sort());
    expect(bPeers.map((p) => p.clientId).sort()).toEqual([TAB_A, TAB_B].sort());

    // --- chat flows both ways ---
    await host.mutation(api.call.sendMessage, {
      code,
      from: TAB_A,
      name: "Host",
      text: "Hey guest, can you hear me?",
    });
    await t.mutation(api.call.sendMessage, {
      code,
      from: TAB_B,
      name: "Guest",
      text: "Loud and clear!",
    });
    const chat = await host.query(api.call.listMessages, { code });
    expect(chat.map((m) => m.text)).toEqual([
      "Hey guest, can you hear me?",
      "Loud and clear!",
    ]);
    expect(chat[1].from).toBe(TAB_B);

    // --- reactions, hand raise and sharing state propagate ---
    await t.mutation(api.call.sendReaction, {
      code,
      clientId: TAB_B,
      emoji: "👋",
      name: "Guest",
    });
    const reactions = await host.query(api.call.listReactions, { code });
    expect(reactions.some((r) => r.emoji === "👋")).toBe(true);

    await t.mutation(api.call.setHandRaised, { code, clientId: TAB_B, raised: true });
    await host.mutation(api.call.setSharing, { code, clientId: TAB_A, sharing: true });
    const withState = await host.query(api.call.listParticipants, { code });
    expect(withState.find((p) => p.clientId === TAB_B)?.handRaised).toBe(true);
    expect(withState.find((p) => p.clientId === TAB_A)?.sharing).toBe(true);

    // --- heartbeats keep both tabs alive in the roster ---
    await host.mutation(api.call.heartbeat, { code, clientId: TAB_A });
    await t.mutation(api.call.heartbeat, { code, clientId: TAB_B });
    expect(await host.query(api.call.listParticipants, { code })).toHaveLength(2);

    // --- guest leaves: host sees the bye and the roster drops back to 1 ---
    await t.mutation(api.call.leaveRoom, { code, clientId: TAB_B });
    const aSignals3 = await t.query(api.call.listSignals, { code, to: TAB_A });
    expect(ofKind(aSignals3, "bye").map((s) => s.from)).toContain(TAB_B);
    const afterLeave = await host.query(api.call.listParticipants, { code });
    expect(afterLeave.map((p) => p.clientId)).toEqual([TAB_A]);
  });

  it("waiting room: a third tab is held, then joins the mesh once admitted", async () => {
    const t = makeTestClient();
    const { hostId, host, code } = await startMeeting(t);

    await host.mutation(api.security.updateMeetingSettings, { code, waitingRoom: true });
    await host.mutation(api.call.joinRoom, {
      code,
      clientId: TAB_A,
      name: "Host",
      userId: hostId,
    });

    // guest tab joins while the waiting room is on -> held, not on the mesh
    const cJoin = await t.mutation(api.call.joinRoom, {
      code,
      clientId: TAB_C,
      name: "Guest",
      userId: undefined,
    });
    expect(cJoin.waiting).toBe(true);
    expect(cJoin.participants).toEqual([]);
    expect(await host.query(api.call.listParticipants, { code })).toHaveLength(1);
    const waiting = await host.query(api.security.listWaitingParticipants, { code });
    expect(waiting.map((w) => w.clientId)).toEqual([TAB_C]);

    // host admits -> the guest can join the mesh now
    await host.mutation(api.security.admitParticipant, { code, clientId: TAB_C });
    expect(await host.query(api.security.listWaitingParticipants, { code })).toEqual([]);

    // the guest tab re-broadcasts hello (mirrors the hook's admission effect)
    await t.mutation(api.call.sendSignal, {
      code,
      from: TAB_C,
      to: "*",
      kind: "hello",
      payload: JSON.stringify({ clientId: TAB_C, name: "Guest" }),
    });
    // host (the smaller clientId) opens the connection to the newcomer
    await host.mutation(api.call.sendSignal, {
      code,
      from: TAB_A,
      to: TAB_C,
      kind: "offer",
      payload: JSON.stringify({ type: "offer", sdp: "sdp-a->c" }),
    });
    await t.mutation(api.call.sendSignal, {
      code,
      from: TAB_C,
      to: TAB_A,
      kind: "answer",
      payload: JSON.stringify({ type: "answer", sdp: "sdp-c->a" }),
    });

    // both tabs converge on the full roster
    const roster = await host.query(api.call.listParticipants, { code });
    expect(roster.map((p) => p.clientId).sort()).toEqual([TAB_A, TAB_C].sort());
    const cSignals = await t.query(api.call.listSignals, { code, to: TAB_C });
    expect(ofKind(cSignals, "offer").map((s) => s.from)).toEqual([TAB_A]);
  });

  it("refuses a new tab when the host locks or ends the meeting (shared-link path)", async () => {
    const t = makeTestClient();
    const { hostId, host, code } = await startMeeting(t);
    await host.mutation(api.call.joinRoom, {
      code,
      clientId: TAB_A,
      name: "Host",
      userId: hostId,
    });

    // locked -> guests clicking the link get a clear refusal
    await host.mutation(api.meetings.lockMeeting, { code, locked: true });
    await expect(
      t.mutation(api.call.joinRoom, { code, clientId: TAB_B, name: "Guest", userId: undefined }),
    ).rejects.toThrow(/locked/i);
    await host.mutation(api.meetings.lockMeeting, { code, locked: false });

    // ended -> same refusal, plus an "end" broadcast tells in-room clients
    await host.mutation(api.meetings.endMeeting, { code });
    await expect(
      t.mutation(api.call.joinRoom, { code, clientId: TAB_B, name: "Guest", userId: undefined }),
    ).rejects.toThrow(/ended/i);

    const aSignals = await t.query(api.call.listSignals, { code, to: TAB_A });
    expect(ofKind(aSignals, "end")).toHaveLength(1);
  });
});
