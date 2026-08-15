import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { normalizeCode } from "./rooms";

/**
 * Live recording state lives on the `rooms` doc so every participant sees a
 * "recording in progress" indicator reactively — nobody can record secretly.
 *
 * Permissions:
 * - Only the host or an in-room co-host may change the state.
 * - Only the client that STARTED the recording may pause / resume / stop it
 *   (that client owns the MediaRecorder, so anyone else couldn't actually
 *   control the capture anyway).
 */

async function findPresenceByUser(ctx: MutationCtx, code: string, userId: string) {
  const rows = await ctx.db
    .query("presence")
    .withIndex("by_code", (q) => q.eq("code", code))
    .collect();
  return rows.find((r) => r.userId === userId) ?? null;
}

async function canModerate(ctx: MutationCtx, code: string, userId: string) {
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (room?.createdBy === userId) return true;
  const settings = await ctx.db
    .query("meetingSettings")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (settings) {
    const mine = await findPresenceByUser(ctx, code, userId);
    if (mine && settings.coHosts.includes(mine.clientId)) return true;
  }
  return false;
}

/**
 * Set the room's live recording state. Throws for non-moderators and for
 * non-starters trying to pause/resume/stop someone else's recording.
 */
export const setRecordingState = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    state: v.object({
      active: v.boolean(),
      paused: v.optional(v.boolean()),
      startedAt: v.optional(v.number()),
      byClientId: v.optional(v.string()),
      byName: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { code, clientId, state }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage recordings.");
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null) throw new Error("Meeting not found.");
    if (!(await canModerate(ctx, normalized, userId)))
      throw new Error("Only the host or a co-host can control recordings.");

    const current = room.recording;

    if (state.active) {
      // Pause/resume carries an explicit `paused` flag: only the starter may
      // flip flags on a live recording.
      if (state.paused !== undefined && current?.active === true) {
        if (current.byClientId !== clientId)
          throw new Error("Only the person who started the recording can control it.");
        await ctx.db.patch(room._id, {
          recording: {
            active: true,
            paused: state.paused === true,
            startedAt: current.startedAt,
            byClientId: current.byClientId,
            byName: current.byName,
          },
        });
        return;
      }
      // Fresh start — reject if a recording is already in flight (by anyone).
      if (current?.active === true)
        throw new Error("A recording is already in progress.");
      await ctx.db.patch(room._id, {
        recording: {
          active: true,
          paused: state.paused === true,
          startedAt: state.startedAt ?? Date.now(),
          byClientId: clientId,
          byName: state.byName,
        },
      });
      return;
    }

    // Stop — only the starter may end a live recording; no-op otherwise.
    if (current?.active === true && current.byClientId !== clientId)
      throw new Error("Only the person who started the recording can control it.");
    await ctx.db.patch(room._id, { recording: undefined });
  },
});

/** Live recording state for the room, or null when nobody is recording. */
export const getRecordingState = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return null;
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    return room?.recording ?? null;
  },
});
