import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";

/** Shared helper so other modules can push notifications. */
export async function createNotification(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: string;
    title: string;
    body?: string;
    link?: string;
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    read: false,
    createdAt: Date.now(),
  });
}

/** Internal entry point so Convex actions can push notifications. */
export const push = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await createNotification(ctx, args);
  },
});

export const listNotifications = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.filter((n) => !n.read).length;
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const row = await ctx.db.get(id);
    if (row === null || row.userId !== userId) return;
    await ctx.db.patch(id, { read: true });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) {
      if (!row.read) await ctx.db.patch(row._id, { read: true });
    }
  },
});

/** Delete a single notification (owner only). */
export const remove = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const row = await ctx.db.get(id);
    if (row === null || row.userId !== userId) return;
    await ctx.db.delete(id);
  },
});

/**
 * Paginated notification list. Returns up to `limit` notifications
 * newer than `cursor` (a createdAt timestamp). Pass cursor=0 for the first page.
 * Includes an `unreadOnly` filter for the Unread tab.
 */
export const listPaged = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { cursor, limit, unreadOnly }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { items: [], nextCursor: 0, hasMore: false };
    const pageSize = Math.min(limit ?? 30, 50);
    let q = ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc");
    if (cursor && cursor > 0) {
      q = q.filter((q) => q.lt(q.field("createdAt"), cursor));
    }
    const rows = await q.take(pageSize + 1);
    const hasMore = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const filtered = unreadOnly === true ? items.filter((n) => !n.read) : items;
    const nextCursor = items.length > 0 ? items[items.length - 1].createdAt : 0;
    return { items: filtered, nextCursor, hasMore };
  },
});
