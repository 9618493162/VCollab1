import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeCode } from "./rooms";
import { createNotification } from "./notifications";

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

async function findRecordingByEgress(
  ctx: MutationCtx,
  egressId: string,
) {
  return await ctx.db
    .query("recordings")
    .withIndex("by_egress", (q) => q.eq("egressId", egressId))
    .first();
}

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

/** Internal: the recordings row for an egress, used by the auto-transcription
 *  pipeline (internal.ai.transcribeEgressRecording) after finalization. */
export const getRecordingByEgress = internalQuery({
  args: { egressId: v.string() },
  handler: async (ctx, { egressId }) => {
    return await ctx.db
      .query("recordings")
      .withIndex("by_egress", (q) => q.eq("egressId", egressId))
      .first();
  },
});

/** Internal: stamp the egress row after its transcript/analysis is stored so
 *  the pipeline never runs twice for the same recording. */
export const markRecordingTranscribed = internalMutation({
  args: { egressId: v.string() },
  handler: async (ctx, { egressId }) => {
    const row = await findRecordingByEgress(ctx, egressId);
    if (row) await ctx.db.patch(row._id, { transcribedAt: Date.now() });
  },
});

// ---- internal helpers for LiveKit cloud recordings (convex/livekit.ts) ----

/** Mark the room as cloud-recording and create the pending recordings row. */
export const startCloudRecording = internalMutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    byName: v.string(),
    egressId: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, { code, clientId, byName, egressId, startedAt }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("Invalid meeting code.");
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null) throw new Error("Meeting not found.");
    await ctx.db.patch(room._id, {
      recording: {
        active: true,
        paused: false,
        startedAt,
        byClientId: clientId,
        byName,
        egressId,
        mode: "cloud",
      },
    });
    await ctx.db.insert("recordings", {
      code: normalized,
      createdBy: room.createdBy,
      createdAt: startedAt,
      startedAt,
      egressId,
      status: "recording",
    });
  },
});

/** Clear the live recording state on the room doc. */
export const clearRoomRecording = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return;
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room) await ctx.db.patch(room._id, { recording: undefined });
  },
});

/** The egress was told to stop; the file is still being finalized server-side. */
export const markRecordingFinalizing = internalMutation({
  args: { egressId: v.string() },
  handler: async (ctx, { egressId }) => {
    const row = await findRecordingByEgress(ctx, egressId);
    if (row && row.status !== "ready" && row.status !== "error") {
      await ctx.db.patch(row._id, { status: "finalizing" });
    }
  },
});

/** The egress finished; store the playback URL on the recordings row. */
export const finalizeCloudRecording = internalMutation({
  args: {
    code: v.string(),
    egressId: v.string(),
    url: v.string(),
    filename: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { code, egressId, url, filename, durationMs }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return;
    const row = await findRecordingByEgress(ctx, egressId);
    if (row === null) return; // unknown egress — ignore (e.g. wiped test data)
    await ctx.db.patch(row._id, {
      status: "ready",
      url: url || undefined,
      filename,
      durationMs,
    });
    // Kick off the post-meeting pipeline (transcript → summary → action
    // items) exactly once for this egress. Fire-and-forget: a scheduling
    // failure must never break finalization.
    if (url) {
      try {
        await ctx.scheduler.runAfter(0, internal.ai.transcribeEgressRecording, {
          code: normalized,
          egressId,
        });
      } catch {
        // best-effort — user can still generate analysis from the Recordings tab
      }
    }
  },
});

/** The egress failed or was aborted; mark the row so the UI can say so. */
export const failCloudRecording = internalMutation({
  args: { egressId: v.string() },
  handler: async (ctx, { egressId }) => {
    const row = await findRecordingByEgress(ctx, egressId);
    if (row) await ctx.db.patch(row._id, { status: "error" });
  },
});

/**
 * Entry point for LiveKit webhook events (egress_updated / egress_ended).
 * Status arrives as an already-mapped "running" | "complete" | "error" so
 * the http layer stays thin and this stays unit-testable.
 */
export const handleEgressEvent = internalMutation({
  args: {
    egressId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("complete"),
      v.literal("error"),
    ),
    url: v.optional(v.string()),
    filename: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { egressId, status, url, filename, durationMs }) => {
    if (status === "complete") {
      const row = await findRecordingByEgress(ctx, egressId);
      if (row === null) return;
      await ctx.db.patch(row._id, {
        status: "ready",
        url: url || undefined,
        filename,
        durationMs,
      });
      // Auto-transcribe (idempotent, guarded by transcribedAt) — same
      // pipeline as the client-polling finalize path.
      if (url && !row.transcribedAt) {
        try {
          await ctx.scheduler.runAfter(0, internal.ai.transcribeEgressRecording, {
            code: row.code,
            egressId,
          });
        } catch {
          // best-effort
        }
      }
      // Notify the recording owner that their recording is ready.
      try {
        await createNotification(ctx, {
          userId: row.createdBy,
          type: "recording",
          title: "Your recording is ready",
          body: `Meeting ${row.code} recording is available for playback.`,
          link: `/meeting/${row.code}/analysis`,
        });
      } catch {
        // best-effort
      }
    } else if (status === "error") {
      const row = await findRecordingByEgress(ctx, egressId);
      if (row) await ctx.db.patch(row._id, { status: "error" });
    }
  },
});
