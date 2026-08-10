import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { normalizeCode } from "./rooms";

const PRESENCE_TTL_MS = 45_000; // drop presence rows that stopped heartbeating
const SIGNAL_WINDOW_MS = 30 * 60_000; // prune old signals

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

/** Join a meeting: register presence and broadcast a hello so peers connect. */
export const joinRoom = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { code, clientId, name }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null) throw new Error("This meeting doesn't exist yet.");

    const cleanName = name.trim().slice(0, 40) || "Guest";
    const now = Date.now();

    // replace any stale presence row for this client
    const stale = await findPresence(ctx, normalized, clientId);
    if (stale) await ctx.db.delete(stale._id);

    await ctx.db.insert("presence", {
      code: normalized,
      clientId,
      name: cleanName,
      joinedAt: now,
      lastSeen: now,
    });

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
    return others
      .filter((p) => p.clientId !== clientId)
      .map((p) => ({ clientId: p.clientId, name: p.name }));
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

/** Who's currently in the meeting (heartbeats within the TTL). */
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
      .filter((p) => p.lastSeen >= cutoff)
      .map((p) => ({ clientId: p.clientId, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
    const clean = text.trim().slice(0, 500);
    if (clean === "") throw new Error("Message can't be empty.");
    await ctx.db.insert("messages", {
      code: normalized,
      from,
      name: name.trim().slice(0, 40) || "Guest",
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
