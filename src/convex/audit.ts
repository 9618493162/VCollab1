import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Record an audit log entry. Can be called from any mutation. */
export const log = mutation({
  args: {
    action: v.string(),
    actorId: v.optional(v.id("users")),
    actorName: v.optional(v.string()),
    targetId: v.optional(v.string()),
    targetType: v.optional(v.string()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLog", {
      action: args.action,
      actorId: args.actorId,
      actorName: args.actorName,
      targetId: args.targetId,
      targetType: args.targetType,
      meta: args.meta,
      createdAt: Date.now(),
    });
  },
});

/** List recent audit log entries (admin/workspace owner only). */
export const list = query({
  args: {
    limit: v.optional(v.number()),
    action: v.optional(v.string()),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    after: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const limit = Math.min(args.limit ?? 50, 100);
    let q = ctx.db.query("auditLog").withIndex("by_time");

    if (args.after) q = q.filter((s) => s.gt(s.field("createdAt"), args.after!));
    if (args.before) q = q.filter((s) => s.lt(s.field("createdAt"), args.before!));
    if (args.action) q = q.filter((s) => s.eq(s.field("action"), args.action!));
    if (args.targetType) q = q.filter((s) => s.eq(s.field("targetType"), args.targetType!));
    if (args.targetId) q = q.filter((s) => s.eq(s.field("targetId"), args.targetId!));

    return await q.order("desc").take(limit);
  },
});

/** Count audit entries for a given filter. */
export const count = query({
  args: {
    action: v.optional(v.string()),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    after: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;

    let q = ctx.db.query("auditLog").withIndex("by_time");
    if (args.after) q = q.filter((s) => s.gt(s.field("createdAt"), args.after!));
    if (args.action) q = q.filter((s) => s.eq(s.field("action"), args.action!));
    if (args.targetType) q = q.filter((s) => s.eq(s.field("targetType"), args.targetType!));
    if (args.targetId) q = q.filter((s) => s.eq(s.field("targetId"), args.targetId!));

    const all = await q.take(200);
    return all.length;
  },
});
