import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
) {
  const rows = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  return rows.find((r) => r.userId === userId) ?? null;
}

export const getWorkspacePolicies = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    if (!member.some((m) => m.userId === userId)) return null;

    const row = await ctx.db
      .query("workspacePolicies")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    return row ?? null;
  },
});

export const upsertWorkspacePolicies = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    waitingRoom: v.boolean(),
    allowMic: v.boolean(),
    allowCam: v.boolean(),
    allowShare: v.union(
      v.literal("everyone"),
      v.literal("host"),
      v.literal("hostAndCoHosts"),
    ),
    allowChat: v.boolean(),
    allowReactions: v.boolean(),
    allowRecording: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const me = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const membership = me.find((m) => m.userId === userId);
    if (membership?.role !== "owner" && membership?.role !== "admin")
      throw new Error("Only owners and admins can change meeting policies.");

    const existing = await ctx.db
      .query("workspacePolicies")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();

    const data = {
      workspaceId: args.workspaceId,
      waitingRoom: args.waitingRoom,
      allowMic: args.allowMic,
      allowCam: args.allowCam,
      allowShare: args.allowShare,
      allowChat: args.allowChat,
      allowReactions: args.allowReactions,
      allowRecording: args.allowRecording,
      updatedBy: userId,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("workspacePolicies", data);
    }
  },
});
