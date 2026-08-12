import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, QueryCtx, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeCode } from "./rooms";

/** Resolve the signed-in user as host of `code`, or throw. */
async function requireHost(ctx: MutationCtx | QueryCtx, code: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to manage breakout rooms");
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (room === null) throw new Error("Meeting not found.");
  if (room.createdBy !== userId) throw new Error("Only the host can manage breakout rooms.");
  return userId;
}

async function getSession(ctx: MutationCtx | QueryCtx, code: string) {
  return await ctx.db
    .query("breakoutSessions")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

function cleanName(name: string) {
  return name.trim().slice(0, 40);
}

/**
 * Everything about a meeting's breakout rooms: the session state (active or
 * ended, countdown timer), the rooms with their members, and the people
 * currently in the call so the host can assign them.
 */
export const listBreakouts = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") {
      return { session: null, rooms: [], participants: [] };
    }

    const session = await getSession(ctx, normalized);

    const rooms = await ctx.db
      .query("breakoutRooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    const members = await ctx.db
      .query("breakoutMembers")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();

    const roomViews = await Promise.all(
      rooms.map(async (room) => {
        const roomMembers = members.filter((m) => m.roomId === room._id);
        const messages = await ctx.db
          .query("breakoutMessages")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .collect();
        return {
          _id: room._id,
          name: room.name,
          members: roomMembers.map((m) => ({ clientId: m.clientId, name: m.name })),
          messageCount: messages.length,
        };
      }),
    );

    // people currently in the call, tagged with the room they're assigned to
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    const participants = presence.map((p) => ({
      clientId: p.clientId,
      name: p.name,
      roomId: members.find((m) => m.clientId === p.clientId)?.roomId ?? null,
    }));

    return {
      session: session
        ? {
            active: session.status === "active",
            timerEndsAt: session.timerEndsAt ?? undefined,
          }
        : null,
      rooms: roomViews,
      participants,
    };
  },
});

/** Host creates a breakout room (starting the session on first use). */
export const createBreakout = mutation({
  args: {
    code: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { code, name }) => {
    const userId = await requireHost(ctx, code);
    const normalized = normalizeCode(code);

    const session = await getSession(ctx, normalized);
    if (session === null || session.status === "ended") {
      if (session !== null) await ctx.db.delete(session._id);
      await ctx.db.insert("breakoutSessions", {
        code: normalized,
        status: "active",
        createdBy: userId,
        createdAt: Date.now(),
      });
    }

    const clean = cleanName(name ?? "");
    const label =
      clean !== ""
        ? clean
        : `Room ${(await ctx.db.query("breakoutRooms").withIndex("by_code", (q) => q.eq("code", normalized)).collect()).length + 1}`;

    return await ctx.db.insert("breakoutRooms", {
      code: normalized,
      name: label,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

/** Host renames a breakout room. */
export const renameBreakout = mutation({
  args: {
    code: v.string(),
    roomId: v.id("breakoutRooms"),
    name: v.string(),
  },
  handler: async (ctx, { code, roomId, name }) => {
    await requireHost(ctx, code);
    const room = await ctx.db.get(roomId);
    if (room === null) throw new Error("Room not found.");
    const clean = cleanName(name);
    if (clean === "") throw new Error("Give the room a name.");
    await ctx.db.patch(roomId, { name: clean });
  },
});

/** Host deletes a room along with its memberships and messages. */
export const deleteBreakout = mutation({
  args: {
    code: v.string(),
    roomId: v.id("breakoutRooms"),
  },
  handler: async (ctx, { code, roomId }) => {
    await requireHost(ctx, code);
    const room = await ctx.db.get(roomId);
    if (room === null) throw new Error("Room not found.");
    const members = await ctx.db
      .query("breakoutMembers")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);
    const messages = await ctx.db
      .query("breakoutMessages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    for (const m of messages) await ctx.db.delete(m._id);
    await ctx.db.delete(roomId);
  },
});

async function sessionActive(ctx: MutationCtx | QueryCtx, code: string, roomId: Id<"breakoutRooms">) {
  const session = await getSession(ctx, code);
  if (session === null || session.status !== "active")
    throw new Error("Breakout rooms aren't running right now.");
  const room = await ctx.db.get(roomId);
  if (room === null || room.code !== code) throw new Error("Room not found.");
}

async function upsertMembership(
  ctx: MutationCtx,
  code: string,
  roomId: Id<"breakoutRooms">,
  clientId: string,
  name: string,
) {
  if (clientId === "") throw new Error("Join the meeting to use breakout rooms.");
  const existing = await ctx.db
    .query("breakoutMembers")
    .withIndex("by_code", (q) => q.eq("code", code))
    .collect();
  for (const m of existing) {
    if (m.clientId === clientId) await ctx.db.delete(m._id);
  }
  await ctx.db.insert("breakoutMembers", {
    code,
    roomId,
    clientId,
    name: cleanName(name) || "Guest",
    joinedAt: Date.now(),
  });
}

/** Host assigns a participant (by call clientId) to a room. */
export const assignToBreakout = mutation({
  args: {
    code: v.string(),
    roomId: v.id("breakoutRooms"),
    clientId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { code, roomId, clientId, name }) => {
    await requireHost(ctx, code);
    const normalized = normalizeCode(code);
    await sessionActive(ctx, normalized, roomId);
    await upsertMembership(ctx, normalized, roomId, clientId, name);
  },
});

/** A participant joins a room themselves (leaving any room they were in). */
export const joinBreakout = mutation({
  args: {
    code: v.string(),
    roomId: v.id("breakoutRooms"),
    clientId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { code, roomId, clientId, name }) => {
    const normalized = normalizeCode(code);
    await sessionActive(ctx, normalized, roomId);
    await upsertMembership(ctx, normalized, roomId, clientId, name);
  },
});

/** A participant returns to the main meeting. */
export const leaveBreakout = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
  },
  handler: async (ctx, { code, clientId }) => {
    const normalized = normalizeCode(code);
    if (clientId === "") throw new Error("Join the meeting to use breakout rooms.");
    const mine = await ctx.db
      .query("breakoutMembers")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .filter((q) => q.eq(q.field("clientId"), clientId))
      .collect();
    for (const m of mine) await ctx.db.delete(m._id);
  },
});

/** Host starts (or clears) a countdown timer for the breakout session. */
export const setBreakoutTimer = mutation({
  args: {
    code: v.string(),
    minutes: v.number(),
  },
  handler: async (ctx, { code, minutes }) => {
    await requireHost(ctx, code);
    const normalized = normalizeCode(code);
    const session = await getSession(ctx, normalized);
    if (session === null || session.status !== "active")
      throw new Error("Start a breakout session first.");
    if (minutes < 1 || minutes > 120) throw new Error("Pick between 1 and 120 minutes.");
    await ctx.db.patch(session._id, { timerEndsAt: Date.now() + minutes * 60_000 });
  },
});

export const clearBreakoutTimer = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    await requireHost(ctx, code);
    const normalized = normalizeCode(code);
    const session = await getSession(ctx, normalized);
    if (session === null) throw new Error("No breakout session to clear.");
    await ctx.db.patch(session._id, { timerEndsAt: undefined });
  },
});

/** Host ends the session: everyone returns to the main meeting. */
export const endBreakoutSession = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    await requireHost(ctx, code);
    const normalized = normalizeCode(code);
    const session = await getSession(ctx, normalized);
    if (session === null) throw new Error("No breakout session to end.");
    await ctx.db.patch(session._id, { status: "ended", timerEndsAt: undefined });
    const members = await ctx.db
      .query("breakoutMembers")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);
  },
});

/** Send a message to a room (room members, plus the host). */
export const sendBreakoutMessage = mutation({
  args: {
    code: v.string(),
    roomId: v.id("breakoutRooms"),
    clientId: v.string(),
    name: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { code, roomId, clientId, name, text }) => {
    const normalized = normalizeCode(code);
    const room = await ctx.db.get(roomId);
    if (room === null || room.code !== normalized) throw new Error("Room not found.");

    const userId = await getAuthUserId(ctx);
    const membership = await ctx.db
      .query("breakoutMembers")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .filter((q) => q.eq(q.field("clientId"), clientId))
      .first();
    const isRoomMember = membership !== null;
    let isHost = false;
    if (userId !== null) {
      const meeting = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .first();
      isHost = meeting !== null && meeting.createdBy === userId;
    }
    if (!isRoomMember && !isHost) throw new Error("You're not in this room.");

    const clean = text.trim().slice(0, 1000);
    if (clean === "") throw new Error("Message can't be empty.");

    await ctx.db.insert("breakoutMessages", {
      roomId,
      from: clientId,
      name: cleanName(name) || "Guest",
      text: clean,
      createdAt: Date.now(),
    });
  },
});

/** Messages for a room (room members, plus the host). Oldest first. */
export const listBreakoutMessages = query({
  args: {
    code: v.string(),
    roomId: v.id("breakoutRooms"),
  },
  handler: async (ctx, { code, roomId }) => {
    // Meeting-scoped like the other in-call panels: any participant of the
    // meeting can read; the panel only offers rooms the viewer belongs to.
    const normalized = normalizeCode(code);
    const room = await ctx.db.get(roomId);
    if (room === null || room.code !== normalized) return [];

    return await ctx.db
      .query("breakoutMessages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
  },
});
