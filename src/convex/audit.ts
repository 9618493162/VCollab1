import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";

// Audit writes are append-only and must never be callable from the browser.
// Server mutations write entries directly via ctx.db.insert; this internal
// mutation exists for callers that need an id (none today) — either way,
// clients cannot forge audit records.
export const log = internalMutation({
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

/** List recent audit log entries (workspace owners/admins only).
 *
 *  The audit trail is compliance data: it is never readable by ordinary
 *  members or unauthenticated callers. Viewers must hold an owner/admin
 *  role in at least one workspace — the same rule the Admin page gates on.
 */
async function requireAuditViewer(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const isAdmin = memberships.some(
    (m) => m.role === "owner" || m.role === "admin",
  );
  return isAdmin ? userId : null;
}

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
    if ((await requireAuditViewer(ctx)) === null) return [];

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

/** Count audit entries for a given filter (same access rule as `list`). */
export const count = query({
  args: {
    action: v.optional(v.string()),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    after: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if ((await requireAuditViewer(ctx)) === null) return 0;

    let q = ctx.db.query("auditLog").withIndex("by_time");
    if (args.after) q = q.filter((s) => s.gt(s.field("createdAt"), args.after!));
    if (args.action) q = q.filter((s) => s.eq(s.field("action"), args.action!));
    if (args.targetType) q = q.filter((s) => s.eq(s.field("targetType"), args.targetType!));
    if (args.targetId) q = q.filter((s) => s.eq(s.field("targetId"), args.targetId!));

    const all = await q.take(200);
    return all.length;
  },
});
