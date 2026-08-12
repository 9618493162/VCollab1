import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, QueryCtx, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { WorkspaceRole } from "./workspaces";

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

function canManage(role: WorkspaceRole | undefined) {
  return role === "owner" || role === "admin";
}

export const createChannel = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, { workspaceId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const member = await getMembership(ctx, workspaceId, userId);
    if (!member) throw new Error("You are not a member of this workspace.");
    if (member.role === "guest")
      throw new Error("Guests can't create channels.");

    const clean = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9-]{1,32}$/.test(clean))
      throw new Error("Channel names use letters, numbers and dashes only.");

    const existing = await ctx.db
      .query("channels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    if (existing.some((c) => c.name === clean))
      throw new Error("That channel already exists.");

    return await ctx.db.insert("channels", {
      workspaceId,
      name: clean,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteChannel = mutation({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Channel not found.");
    if (channel.name === "general")
      throw new Error("The #general channel can't be deleted.");

    const member = await getMembership(ctx, channel.workspaceId, userId);
    if (!canManage(member?.role))
      throw new Error("Only owners and admins can delete channels.");

    const messages = await ctx.db
      .query("channelMessages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();
    for (const m of messages) await ctx.db.delete(m._id);
    await ctx.db.delete(channelId);
  },
});

export const sendMessage = mutation({
  args: {
    channelId: v.id("channels"),
    text: v.string(),
  },
  handler: async (ctx, { channelId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to send messages.");
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Channel not found.");
    const member = await getMembership(ctx, channel.workspaceId, userId);
    if (!member) throw new Error("You are not a member of this workspace.");

    const clean = text.trim();
    if (clean.length === 0) throw new Error("Message can't be empty.");
    if (clean.length > 4000) throw new Error("Message is too long.");

    const user = await ctx.db.get(userId);
    await ctx.db.insert("channelMessages", {
      channelId,
      userId,
      userName: user?.name ?? "User",
      text: clean,
      createdAt: Date.now(),
    });
  },
});

export const listMessages = query({
  args: {
    channelId: v.id("channels"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { channelId, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const channel = await ctx.db.get(channelId);
    if (!channel) return [];
    const member = await getMembership(ctx, channel.workspaceId, userId);
    if (!member) return [];

    const cap = Math.min(Math.max(limit ?? 100, 1), 500);
    const rows = await ctx.db
      .query("channelMessages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();
    return rows.slice(-cap); // ascending, newest last
  },
});
