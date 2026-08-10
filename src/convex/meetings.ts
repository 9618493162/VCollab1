import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { generateRoomCode, normalizeCode } from "./rooms";

async function getRoomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

/**
 * Schedule a meeting ahead of time. Creates the joinable room (so the code is
 * live immediately) plus scheduling metadata. Returns the meeting code.
 */
export const scheduleMeeting = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    durationMinutes: v.number(),
  },
  handler: async (ctx, { title, description, startTime, durationMinutes }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to schedule a meeting");

    const cleanTitle = title.trim().slice(0, 80) || "Untitled meeting";
    const cleanDesc = (description ?? "").trim().slice(0, 400);
    const duration = Math.min(Math.max(Math.round(durationMinutes), 5), 480);

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateRoomCode();
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .first();
      if (existing === null) {
        code = candidate;
        break;
      }
    }
    if (code === "") throw new Error("Couldn't generate a code, try again.");

    await ctx.db.insert("rooms", {
      code,
      createdBy: userId,
      createdAt: Date.now(),
      title: cleanTitle,
      status: "scheduled",
      locked: false,
    });

    await ctx.db.insert("scheduledMeetings", {
      code,
      hostId: userId,
      title: cleanTitle,
      description: cleanDesc || undefined,
      startTime,
      durationMinutes: duration,
      status: "scheduled",
      createdAt: Date.now(),
    });

    return code;
  },
});

/** Cancel a scheduled meeting (host only). */
export const cancelScheduled = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage meetings");
    const normalized = normalizeCode(code);
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled === null) throw new Error("Scheduled meeting not found.");
    if (scheduled.hostId !== userId)
      throw new Error("Only the host can cancel this meeting.");
    await ctx.db.patch(scheduled._id, { status: "cancelled" });
    const room = await getRoomByCode(ctx, normalized);
    if (room && room.createdBy === userId) {
      await ctx.db.patch(room._id, { status: "ended" });
    }
  },
});

/** Scheduled meetings this user hosts, future first. */
export const listScheduled = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .order("desc")
      .take(40);
  },
});

/** Upcoming, not-yet-started meetings. */
export const listUpcoming = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .collect();
    return rows
      .filter(
        (m) => m.status === "scheduled" && m.startTime + m.durationMinutes * 60_000 > now,
      )
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 10);
  },
});

/** Full meeting history: everything this user has created, newest first. */
export const listHistory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("rooms")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .order("desc")
      .take(100);
  },
});

/** Host ends the meeting for everyone: marks it ended + broadcasts "end". */
export const endMeeting = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to end a meeting");
    const normalized = normalizeCode(code);
    const room = await getRoomByCode(ctx, normalized);
    if (room === null) throw new Error("Meeting not found.");
    if (room.createdBy !== userId)
      throw new Error("Only the host can end the meeting.");

    const now = Date.now();
    await ctx.db.patch(room._id, {
      status: "ended",
      endedAt: now,
    });
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled && scheduled.status !== "cancelled") {
      await ctx.db.patch(scheduled._id, { status: "ended" });
    }

    // tell everyone in the room the meeting is over
    await ctx.db.insert("signals", {
      code: normalized,
      from: userId,
      to: "*",
      kind: "end",
      payload: JSON.stringify({ endedBy: userId }),
      createdAt: now,
    });
  },
});

/** Lock / unlock a meeting so no new participants can join (host only). */
export const lockMeeting = mutation({
  args: { code: v.string(), locked: v.boolean() },
  handler: async (ctx, { code, locked }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to lock a meeting");
    const normalized = normalizeCode(code);
    const room = await getRoomByCode(ctx, normalized);
    if (room === null) throw new Error("Meeting not found.");
    if (room.createdBy !== userId)
      throw new Error("Only the host can lock the meeting.");
    await ctx.db.patch(room._id, { locked });
  },
});

/** True when the signed-in user hosts this meeting. */
export const isHost = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const normalized = normalizeCode(code);
    const room = await getRoomByCode(ctx, normalized);
    return room !== null && room.createdBy === userId;
  },
});
