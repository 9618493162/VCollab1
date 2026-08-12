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

/** Org admins (owner/admin) must be signed in for the admin views. */
async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<WorkspaceRole> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to open admin");
  const member = await getMembership(ctx, workspaceId, userId);
  if (member === null) throw new Error("You are not a member of this workspace.");
  if (member.role !== "owner" && member.role !== "admin")
    throw new Error("Only owners and admins can open admin.");
  return member.role;
}

/**
 * Admin overview for a workspace (Phase 59): headline stats plus a recent
 * activity feed, all derived from real data.
 */
export const getOrgOverview = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const myRole = await requireAdmin(ctx, workspaceId);
    const workspace = await ctx.db.get(workspaceId);
    if (workspace === null) return null;

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const users = await Promise.all(memberships.map((m) => ctx.db.get(m.userId)));
    const memberIds = new Set(memberships.map((m) => m.userId));

    const channels = await ctx.db
      .query("channels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const channelMessageCounts = await Promise.all(
      channels.map(async (c) => {
        const rows = await ctx.db
          .query("channelMessages")
          .withIndex("by_channel", (q) => q.eq("channelId", c._id))
          .collect();
        return rows.length;
      }),
    );

    // meetings hosted by members (rooms + scheduled meetings)
    const rooms = await ctx.db.query("rooms").collect();
    const roomCount = rooms.filter((r) => memberIds.has(r.createdBy)).length;
    const scheduled = await ctx.db.query("scheduledMeetings").collect();
    const scheduledCount = scheduled.filter((m) => memberIds.has(m.hostId)).length;

    // recent activity: latest channel messages across the workspace
    const allMessages = await Promise.all(
      channels.map(async (c) =>
        (await ctx.db
          .query("channelMessages")
          .withIndex("by_channel", (q) => q.eq("channelId", c._id))
          .collect()).map((m) => ({
            id: m._id,
            at: m.createdAt,
            text: m.text,
            author: m.userName,
            channel: c.name,
          })),
      ),
    );
    const activity = allMessages
      .flat()
      .sort((a, b) => b.at - a.at)
      .slice(0, 12);

    return {
      _id: workspace._id,
      name: workspace.name,
      myRole,
      stats: {
        members: memberships.length,
        channels: channels.length,
        messages: channelMessageCounts.reduce((a, b) => a + b, 0),
        rooms: roomCount,
        scheduledMeetings: scheduledCount,
      },
      members: memberships
        .map((m, i) => ({
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          name: users[i]?.name ?? "User",
          email: users[i]?.email ?? "",
        }))
        .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name))),
      channels: channels.map((c, i) => ({ _id: c._id, name: c.name, messageCount: channelMessageCounts[i] })),
      activity,
    };
  },
});

/**
 * Ownership transfer (Phase 59): the current owner hands the workspace to
 * another member. The old owner stays on as an admin so the workspace never
 * loses an owner.
 */
export const transferOwnership = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    newOwnerId: v.id("users"),
  },
  handler: async (ctx, { workspaceId, newOwnerId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage the workspace");
    const me = await getMembership(ctx, workspaceId, userId);
    if (me?.role !== "owner") throw new Error("Only the owner can transfer ownership.");

    const target = await getMembership(ctx, workspaceId, newOwnerId);
    if (target === null) throw new Error("That user is not a member.");

    await ctx.db.patch(target._id, { role: "owner" });
    await ctx.db.patch(me._id, { role: "admin" });
  },
});
