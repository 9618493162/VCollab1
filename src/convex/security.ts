import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, QueryCtx, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeCode } from "./rooms";

const DEFAULTS = {
  waitingRoom: false,
  allowMic: true,
  allowCam: true,
  allowShare: true,
  allowChat: true,
  allowReactions: true,
  coHosts: [],
};

async function getRoom(ctx: QueryCtx | MutationCtx, code: string) {
  const normalized = normalizeCode(code);
  if (normalized === "") return null;
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .first();
}

async function getSettings(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db
    .query("meetingSettings")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

/** The signed-in user must be the host, or a co-host whose client is in the room. */
async function requireHostOrCoHost(ctx: MutationCtx | QueryCtx, code: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to manage the meeting");
  const room = await getRoom(ctx, code);
  if (room === null) throw new Error("Meeting not found.");
  if (room.createdBy === userId) return { userId, isHost: true as const, room };

  const settings = await getSettings(ctx, room.code);
  if (settings) {
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", room.code))
      .collect();
    const mine = rows.find((r) => r.userId === userId);
    if (mine && settings.coHosts.includes(mine.clientId)) {
      return { userId, isHost: false as const, room };
    }
  }
  throw new Error("Only the host or a co-host can do that.");
}

async function requireHost(ctx: MutationCtx | QueryCtx, code: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to manage the meeting");
  const room = await getRoom(ctx, code);
  if (room === null) throw new Error("Meeting not found.");
  if (room.createdBy !== userId) throw new Error("Only the host can do that.");
  return { userId, room };
}

/** Current security settings for a meeting (defaults when unset). */
export const getMeetingSettings = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await getRoom(ctx, code);
    if (room === null) return null;
    const settings = await getSettings(ctx, room.code);
    return {
      waitingRoom: settings?.waitingRoom ?? DEFAULTS.waitingRoom,
      allowMic: settings?.allowMic ?? DEFAULTS.allowMic,
      allowCam: settings?.allowCam ?? DEFAULTS.allowCam,
      allowShare: settings?.allowShare ?? DEFAULTS.allowShare,
      allowChat: settings?.allowChat ?? DEFAULTS.allowChat,
      allowReactions: settings?.allowReactions ?? DEFAULTS.allowReactions,
      coHosts: settings?.coHosts ?? [],
      updatedAt: settings?.updatedAt ?? 0,
    };
  },
});

/** Host updates meeting permissions / waiting room. */
export const updateMeetingSettings = mutation({
  args: {
    code: v.string(),
    waitingRoom: v.optional(v.boolean()),
    allowMic: v.optional(v.boolean()),
    allowCam: v.optional(v.boolean()),
    allowShare: v.optional(v.boolean()),
    allowChat: v.optional(v.boolean()),
    allowReactions: v.optional(v.boolean()),
  },
  handler: async (ctx, { code, ...patch }) => {
    const { userId, room } = await requireHost(ctx, code);
    const existing = await getSettings(ctx, room.code);
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(patch)) {
      if (typeof val === "boolean") clean[key] = val;
    }
    if (Object.keys(clean).length === 0) return;

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...clean,
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("meetingSettings", {
        code: room.code,
        waitingRoom: (clean.waitingRoom as boolean | undefined) ?? DEFAULTS.waitingRoom,
        allowMic: (clean.allowMic as boolean | undefined) ?? DEFAULTS.allowMic,
        allowCam: (clean.allowCam as boolean | undefined) ?? DEFAULTS.allowCam,
        allowShare: (clean.allowShare as boolean | undefined) ?? DEFAULTS.allowShare,
        allowChat: (clean.allowChat as boolean | undefined) ?? DEFAULTS.allowChat,
        allowReactions: (clean.allowReactions as boolean | undefined) ?? DEFAULTS.allowReactions,
        coHosts: [],
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    }
  },
});

/** People held in the waiting room (host/co-host view).
 *
 * The meeting page subscribes to this for every participant (guests included),
 * so instead of throwing for non-moderators it returns an empty list — the
 * UI already gates the waiting-room UI on host/co-host status. */
export const listWaitingParticipants = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await getRoom(ctx, code);
    if (room === null) return [];

    // Only the host (or a co-host currently in the room) can view the list.
    const userId = await getAuthUserId(ctx);
    let isModerator = userId !== null && room.createdBy === userId;
    if (!isModerator && userId !== null) {
      const settings = await getSettings(ctx, room.code);
      if (settings) {
        const rows = await ctx.db
          .query("presence")
          .withIndex("by_code", (q) => q.eq("code", room.code))
          .collect();
        const mine = rows.find((r) => r.userId === userId);
        if (mine && settings.coHosts.includes(mine.clientId)) isModerator = true;
      }
    }
    if (!isModerator) return [];
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", room.code))
      .collect();
    return rows
      .filter((r) => r.waiting === true)
      .map((r) => ({ clientId: r.clientId, name: r.name, joinedAt: r.joinedAt }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  },
});

/** Host admits one participant from the waiting room. */
export const admitParticipant = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const { room } = await requireHostOrCoHost(ctx, code);
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", room.code))
      .collect();
    const row = rows.find((r) => r.clientId === clientId);
    if (row === null || row === undefined) throw new Error("That person isn't waiting.");
    await ctx.db.patch(row._id, { waiting: false });
  },
});

/** Host admits everyone currently waiting. */
export const admitAllWaiting = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { room } = await requireHostOrCoHost(ctx, code);
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", room.code))
      .collect();
    for (const r of rows) {
      if (r.waiting === true) await ctx.db.patch(r._id, { waiting: false });
    }
  },
});

/** Host sends a waiting participant back (removes them and tells their client). */
export const rejectParticipant = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const { room } = await requireHostOrCoHost(ctx, code);
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", room.code))
      .collect();
    const row = rows.find((r) => r.clientId === clientId);
    if (row === null || row === undefined) throw new Error("That person isn't waiting.");
    await ctx.db.delete(row._id);
    await ctx.db.insert("signals", {
      code: room.code,
      from: room.createdBy,
      to: clientId,
      kind: "kick",
      payload: JSON.stringify({ by: room.createdBy }),
      createdAt: Date.now(),
    });
  },
});

/** Host promotes a participant to co-host (moderation powers). */
export const makeCoHost = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const { userId, room } = await requireHost(ctx, code);
    const settings = await getSettings(ctx, room.code);
    const coHosts = settings?.coHosts ?? [];
    if (!coHosts.includes(clientId)) {
      if (settings) {
        await ctx.db.patch(settings._id, {
          coHosts: [...coHosts, clientId],
          updatedBy: userId,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("meetingSettings", {
          code: room.code,
          ...DEFAULTS,
          coHosts: [clientId],
          updatedBy: userId,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

/** Host removes co-host powers. */
export const removeCoHost = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const { userId, room } = await requireHost(ctx, code);
    const settings = await getSettings(ctx, room.code);
    if (settings) {
      await ctx.db.patch(settings._id, {
        coHosts: settings.coHosts.filter((c) => c !== clientId),
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    }
  },
});

/** Host hands the meeting to a signed-in participant who is in the room. */
export const transferHost = mutation({
  args: { code: v.string(), userId: v.id("users") },
  handler: async (ctx, { code, userId }) => {
    const { room } = await requireHost(ctx, code);
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", room.code))
      .collect();
    const target = rows.find((r) => r.userId === userId);
    if (target === undefined) throw new Error("That person isn't in the meeting.");
    if (target.waiting) throw new Error("That person is still in the waiting room.");
    const now = Date.now();
    await ctx.db.patch(room._id, { createdBy: userId });
    await ctx.db.insert("signals", {
      code: room.code,
      from: room.createdBy,
      to: "*",
      kind: "host",
      payload: JSON.stringify({ hostId: userId, previousHostId: room.createdBy, timestamp: now }),
      createdAt: now,
    });
  },
});

/**
 * Atomically transfer host and leave the meeting.
 * The old host becomes a normal participant then leaves.
 * The meeting continues with the new host.
 */
export const transferAndLeave = mutation({
  args: { code: v.string(), targetUserId: v.id("users"), clientId: v.string() },
  handler: async (ctx, { code, targetUserId, clientId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to transfer host.");
    const room = await getRoom(ctx, code);
    if (room === null) throw new Error("Meeting not found.");
    if (room.createdBy !== userId) throw new Error("Only the host can transfer host.");
    if (room.status === "ended" || room.status === "expired" || room.status === "cancelled")
      throw new Error("This meeting is no longer active.");
    if (targetUserId === userId) throw new Error("You are already the host.");

    // Verify target is an active, non-waiting participant
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", room.code))
      .collect();
    const target = rows.find((r) => r.userId === targetUserId);
    if (!target) throw new Error("That person isn't in the meeting.");
    if (target.waiting) throw new Error("That person is still in the waiting room.");

    const now = Date.now();

    // 1. Transfer host atomically
    await ctx.db.patch(room._id, { createdBy: targetUserId });

    // 2. Remove old host's presence (they're leaving)
    const oldHostPresence = rows.find((r) => r.clientId === clientId || r.userId === userId);
    if (oldHostPresence) await ctx.db.delete(oldHostPresence._id);

    // 3. Broadcast host transfer event
    await ctx.db.insert("signals", {
      code: room.code,
      from: userId,
      to: "*",
      kind: "host",
      payload: JSON.stringify({ hostId: targetUserId, previousHostId: userId, timestamp: now }),
      createdAt: now,
    });

    // 4. Broadcast that old host left
    await ctx.db.insert("signals", {
      code: room.code,
      from: clientId,
      to: "*",
      kind: "bye",
      payload: JSON.stringify({ clientId }),
      createdAt: now,
    });
  },
});

/** Host mutes everyone (broadcast signal; each client honors it unless it's their own). */
export const muteAll = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const { room } = await requireHostOrCoHost(ctx, code);
    await ctx.db.insert("signals", {
      code: room.code,
      from: clientId,
      to: "*",
      kind: "mute",
      payload: JSON.stringify({ from: clientId }),
      createdAt: Date.now(),
    });
  },
});
