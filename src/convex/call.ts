import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeCode } from "./rooms";
import { createNotification } from "./notifications";
import { usersByEmails } from "./meetings";

const PRESENCE_TTL_MS = 45_000; // drop presence rows that stopped heartbeating
const SIGNAL_WINDOW_MS = 30 * 60_000; // prune old signals
const REACTION_WINDOW_MS = 30_000; // prune old reactions

async function findPresence(
  ctx: QueryCtx,
  code: string,
  clientId: string,
) {
  return await ctx.db
    .query("presence")
    .withIndex("by_code", (q) => q.eq("code", code))
    .filter((q) => q.eq(q.field("clientId"), clientId))
    .first();
}

async function findPresenceByUser(ctx: QueryCtx, code: string, userId: Id<"users">) {
  const rows = await ctx.db
    .query("presence")
    .withIndex("by_code", (q) => q.eq("code", code))
    .collect();
  return rows.find((r) => r.userId === userId) ?? null;
}

async function getMeetingSettings(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db
    .query("meetingSettings")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

/** Host, or a co-host whose client is currently in the room. */
async function canModerate(
  ctx: QueryCtx | MutationCtx,
  code: string,
  userId: Id<"users">,
) {
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (room?.createdBy === userId) return true;
  const settings = await getMeetingSettings(ctx, code);
  if (settings) {
    const mine = await findPresenceByUser(ctx, code, userId);
    if (mine && settings.coHosts.includes(mine.clientId)) return true;
  }
  return false;
}

/**
 * Join a meeting: register presence and broadcast a hello so peers connect.
 * This is the backend's single authoritative join gate — every join attempt
 * (fresh, reconnect, direct API call) is validated here BEFORE any video
 * token or mesh connection is established. Ended / cancelled / expired
 * meetings and expired links are rejected unconditionally.
 */
export const joinRoom = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    name: v.string(),
    userId: v.optional(v.id("users")),
    token: v.optional(v.string()),
  },
  handler: async (ctx, { code, clientId, name, userId, token }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null)
      throw new Error("This meeting code isn't valid or the meeting was never created.");

    // A link carrying the ?t= credential must match the room's live token.
    // The token is revoked on end/expiry, so old saved links die instantly.
    if (token !== undefined && room.joinToken !== token)
      throw new Error("This meeting link is no longer valid.");

    // Lazy expiry: a room past its expiresAt is rejected right here, even if
    // the background sweep hasn't run yet. (Mutations roll back on throw, so
    // the persistent status flip is done by the sweep; getRoom computes the
    // `expired` flag from expiresAt so the UI shows the right screen.)
    const terminal = room.status === "ended" || room.status === "cancelled" || room.status === "expired";
    if (
      !terminal &&
      room.expiresAt !== undefined &&
      room.expiresAt < Date.now()
    ) {
      throw new Error("This meeting has expired.");
    }
    if (room.status === "ended") throw new Error("This meeting has ended.");
    if (room.status === "cancelled") throw new Error("This meeting was cancelled.");
    if (room.status === "expired") throw new Error("This meeting has expired.");
    // waiting room OR locked: hold everyone except the host until they're admitted
    const settings = await getMeetingSettings(ctx, normalized);
    const waiting = room.locked === true || (settings?.waitingRoom === true && room.createdBy !== userId);

    const cleanName = name.trim().slice(0, 40) || "Guest";
    const now = Date.now();

    // first join flips the room from scheduled -> active and stamps start time
    if (room.status !== "active") {
      await ctx.db.patch(room._id, { status: "active", startedAt: now });
      const scheduled = await ctx.db
        .query("scheduledMeetings")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .first();
      if (scheduled && scheduled.status === "scheduled") {
        await ctx.db.patch(scheduled._id, { status: "active" });

        // The meeting is starting now — let invited attendees know
        // (best-effort, respects their reminder preferences).
        const attendees = await usersByEmails(ctx, scheduled.attendees ?? []);
        for (const u of attendees) {
          const wants = await ctx.runQuery(internal.settings.shouldNotify, {
            userId: u._id,
            type: "reminder",
          });
          if (!wants) continue;
          await createNotification(ctx, {
            userId: u._id,
            type: "starting",
            title: `Starting now: ${scheduled.title}`,
            body: `Everyone's gathering · code ${normalized}`,
            link: `/call/${normalized}`,
          });
        }
      }
    }

    // Clean up any stale presence rows for THIS user from previous sessions.
    // A user who left without proper cleanup may still have an orphaned row.
    if (userId) {
      const allPresence = await ctx.db
        .query("presence")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .collect();
      for (const p of allPresence) {
        if (p.userId === userId && p.clientId !== clientId) {
          await ctx.db.delete(p._id);
        }
      }
    }
    // Also clean up any stale row with the same clientId (e.g. fast rejoin)
    const stale = await findPresence(ctx, normalized, clientId);
    if (stale) await ctx.db.delete(stale._id);

    await ctx.db.insert("presence", {
      code: normalized,
      clientId,
      name: cleanName,
      joinedAt: now,
      lastSeen: now,
      sharing: false,
      waiting,
      userId,
    });

    // people waiting don't join the mesh yet — notify the host
    if (waiting) {
      // Best-effort notification to the host so they know someone is outside.
      try {
        await createNotification(ctx, {
          userId: room.createdBy,
          type: "waiting",
          title: `${cleanName} is waiting to join`,
          body: room.locked ? "Meeting is locked" : "Waiting room is enabled",
          link: `/call/${normalized}`,
        });
      } catch {
        // host notification is best-effort; don't block the join attempt
      }
      return { waiting: true, participants: [] };
    }

    // announce ourselves so existing participants open a connection to us
    await ctx.db.insert("signals", {
      code: normalized,
      from: clientId,
      to: "*",
      kind: "hello",
      payload: JSON.stringify({ clientId, name: cleanName }),
      createdAt: now,
    });

    // return who's already here so we can offer connections to them
    const others = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    return {
      waiting: false,
      participants: others
        .filter((p) => p.clientId !== clientId && p.waiting !== true)
        .map((p) => ({
          clientId: p.clientId,
          name: p.name,
          sharing: p.sharing === true,
          handRaised: p.handRaised === true,
        })),
    };
  },
});

/** Leave a meeting: remove presence and broadcast a bye. */
export const leaveRoom = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return;
    const row = await findPresence(ctx, normalized, clientId);
    if (row) await ctx.db.delete(row._id);
    await ctx.db.insert("signals", {
      code: normalized,
      from: clientId,
      to: "*",
      kind: "bye",
      payload: JSON.stringify({ clientId }),
      createdAt: Date.now(),
    });
  },
});

/** Announce whether the current user is screen-sharing. */
export const setSharing = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    sharing: v.boolean(),
  },
  handler: async (ctx, { code, clientId, sharing }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return;
    const row = await findPresence(ctx, normalized, clientId);
    if (row === null) return;
    if (sharing === true) {
      const settings = await getMeetingSettings(ctx, normalized);
      if (settings?.allowShare === false) {
        const userId = await getAuthUserId(ctx);
        const room = await ctx.db
          .query("rooms")
          .withIndex("by_code", (q) => q.eq("code", normalized))
          .first();
        if (userId === null || room?.createdBy !== userId)
          throw new Error("Screen sharing is disabled by the host.");
      }
    }
    await ctx.db.patch(row._id, { sharing });
  },
});

/** Raise or lower the participant's hand. */
export const setHandRaised = mutation({
  args: { code: v.string(), clientId: v.string(), raised: v.boolean() },
  handler: async (ctx, { code, clientId, raised }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return;
    const row = await findPresence(ctx, normalized, clientId);
    if (row) await ctx.db.patch(row._id, { handRaised: raised });
  },
});

/** Fire an emoji reaction into the room (pruned after ~30s). */
export const sendReaction = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    emoji: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { code, clientId, emoji, name }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const pres = await findPresence(ctx, normalized, clientId);
    if (pres === null) throw new Error("You're not in this meeting.");
    const settings = await getMeetingSettings(ctx, normalized);
    if (settings?.allowReactions === false) {
      const room = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .first();
      const hostRow = room ? await findPresenceByUser(ctx, normalized, room.createdBy) : null;
      if (hostRow?.clientId !== clientId)
        throw new Error("Reactions are disabled by the host.");
    }
    // Derive name from presence row to prevent spoofed reactions.
    const safeName = pres.name.trim().slice(0, 40) || "Someone";
    await ctx.db.insert("reactions", {
      code: normalized,
      emoji: emoji.slice(0, 8),
      name: safeName,
      createdAt: Date.now(),
    });
    const cutoff = Date.now() - REACTION_WINDOW_MS;
    const old = await ctx.db
      .query("reactions")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();
    for (const r of old) await ctx.db.delete(r._id);
  },
});

/** Recent reactions in the room, newest first. */
export const listReactions = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("reactions")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("desc")
      .take(20);
  },
});

/** Keep the presence row alive so the participant list stays accurate. */
export const heartbeat = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return;
    const row = await findPresence(ctx, normalized, clientId);
    if (row) await ctx.db.patch(row._id, { lastSeen: Date.now() });
  },
});

/** Relay a WebRTC signal (offer / answer / ice) to a specific peer. */
export const sendSignal = mutation({
  args: {
    code: v.string(),
    from: v.string(),
    to: v.string(),
    kind: v.string(),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, { code, from, to, kind, payload }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const pres = await findPresence(ctx, normalized, from);
    if (pres === null) throw new Error("You're not in this meeting.");
    await ctx.db.insert("signals", {
      code: normalized,
      from,
      to,
      kind,
      payload,
      createdAt: Date.now(),
    });
    // keep the table from growing forever
    const cutoff = Date.now() - SIGNAL_WINDOW_MS;
    const old = await ctx.db
      .query("signals")
      .withIndex("by_code_to", (q) => q.eq("code", normalized))
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();
    for (const sig of old) await ctx.db.delete(sig._id);
  },
});

/** Signals addressed to this client, or broadcast to everyone. */
export const listSignals = query({
  args: { code: v.string(), to: v.string() },
  handler: async (ctx, { code, to }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    const mine = await ctx.db
      .query("signals")
      .withIndex("by_code_to", (q) => q.eq("code", normalized).eq("to", to))
      .order("asc")
      .take(200);
    const broadcast = await ctx.db
      .query("signals")
      .withIndex("by_code_to", (q) => q.eq("code", normalized).eq("to", "*"))
      .order("asc")
      .take(200);
    return [...broadcast, ...mine].sort((a, b) => a.createdAt - b.createdAt);
  },
});

/** Who's in the meeting (heartbeats within the TTL; waiting people excluded). */
export const listParticipants = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    return rows
      .filter((p) => p.lastSeen >= cutoff && p.waiting !== true)
      .map((p) => ({
        clientId: p.clientId,
        name: p.name,
        sharing: p.sharing === true,
        handRaised: p.handRaised === true,
        waiting: p.waiting === true,
        userId: p.userId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Host removes a participant (broadcasts a "kick" signal to their client). */
export const kickParticipant = mutation({
  args: { code: v.string(), target: v.string() },
  handler: async (ctx, { code, target }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage participants");
    const normalized = normalizeCode(code);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null) throw new Error("Meeting not found.");
    if (!(await canModerate(ctx, normalized, userId)))
      throw new Error("Only the host or a co-host can remove participants.");
    const row = await findPresence(ctx, normalized, target);
    if (row) await ctx.db.delete(row._id);
    await ctx.db.insert("signals", {
      code: normalized,
      from: userId,
      to: target,
      kind: "kick",
      payload: JSON.stringify({ by: userId }),
      createdAt: Date.now(),
    });
  },
});

/** Host asks a participant to mute (their client receives a "mute" signal). */
export const muteParticipant = mutation({
  args: { code: v.string(), target: v.string() },
  handler: async (ctx, { code, target }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage participants");
    const normalized = normalizeCode(code);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null) throw new Error("Meeting not found.");
    if (!(await canModerate(ctx, normalized, userId)))
      throw new Error("Only the host or a co-host can mute participants.");
    await ctx.db.insert("signals", {
      code: normalized,
      from: userId,
      to: target,
      kind: "mute",
      payload: JSON.stringify({ by: userId }),
      createdAt: Date.now(),
    });
  },
});

/** Persist a finished recording and its playback URL. */
export const saveRecording = mutation({
  args: {
    code: v.string(),
    storageId: v.id("_storage"),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { code, storageId, durationMs }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to save recordings");
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("Invalid meeting code.");
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new Error("Upload didn't stick, try again.");
    await ctx.db.insert("recordings", {
      code: normalized,
      storageId,
      url,
      createdBy: userId,
      createdAt: Date.now(),
      durationMs,
    });
  },
});

/** Recordings for a meeting, newest first. */
export const listRecordings = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("recordings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("desc")
      .take(10);
  },
});

/** Post a chat message to the meeting. */
export const sendMessage = mutation({
  args: {
    code: v.string(),
    from: v.string(),
    name: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { code, from, name, text }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    // Verify sender is actually present in this meeting (prevents spoofed
    // messages from users who only know the meeting code).
    const pres = await findPresence(ctx, normalized, from);
    if (pres === null) throw new Error("You're not in this meeting.");
    // Derive the display name from the presence row so callers can't
    // impersonate other participants.
    const safeName = pres.name.trim().slice(0, 40) || "Guest";
    const clean = text.trim().slice(0, 500);
    if (clean === "") throw new Error("Message can't be empty.");
    const settings = await getMeetingSettings(ctx, normalized);
    if (settings?.allowChat === false) {
      const room = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .first();
      const hostRow = room ? await findPresenceByUser(ctx, normalized, room.createdBy) : null;
      if (hostRow?.clientId !== from)
        throw new Error("Chat is disabled by the host.");
    }
    await ctx.db.insert("messages", {
      code: normalized,
      from,
      name: safeName,
      text: clean,
      createdAt: Date.now(),
    });
  },
});

/** Chat history for the meeting, oldest first. */
export const listMessages = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("asc")
      .take(200);
  },
});
