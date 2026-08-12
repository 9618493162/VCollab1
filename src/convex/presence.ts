import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const statusValidator = v.union(
  v.literal("available"),
  v.literal("away"),
  v.literal("dnd"),
  v.literal("offline"),
);
export type PresenceStatus = (typeof statusValidator)["type"];

async function upsert(
  ctx: { db: MutationCtx["db"] },
  userId: Id<"users">,
  fields: { status?: PresenceStatus; lastSeen: number },
) {
  const existing = await ctx.db
    .query("userPresence")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: fields.status ?? existing.status,
      lastSeen: fields.lastSeen,
    });
  } else {
    await ctx.db.insert("userPresence", {
      userId,
      status: fields.status ?? "available",
      lastSeen: fields.lastSeen,
    });
  }
}

/** Set my explicit status (available / away / dnd / offline). */
export const setStatus = mutation({
  args: { status: statusValidator },
  handler: async (ctx, { status }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    await upsert(ctx, userId, { status, lastSeen: Date.now() });
  },
});

/** Touch my lastSeen so "available" users don't look stale. */
export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    await upsert(ctx, userId, { lastSeen: Date.now() });
  },
});

/** Presence rows for a set of users (map userId -> { status, lastSeen }). */
export const listStatus = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const me = await getAuthUserId(ctx);
    if (me === null) return {};
    if (userIds.length === 0) return {};

    const rows = await ctx.db.query("userPresence").collect();
    const wanted = new Set(userIds);
    const out: Record<string, { status: PresenceStatus; lastSeen: number }> = {};
    for (const r of rows) {
      if (wanted.has(r.userId)) {
        out[r.userId] = { status: r.status, lastSeen: r.lastSeen };
      }
    }
    return out;
  },
});
