import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Team roles: owner > admin > member > guest (Phase 53). */
export const workspaceRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("guest"),
);
export type WorkspaceRole = (typeof workspaceRole)["type"];

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

/** owner/admin can manage a workspace (invite, roles, channels). */
function canManage(role: WorkspaceRole | undefined) {
  return role === "owner" || role === "admin";
}

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { name, description }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to create a workspace.");
    const clean = name.trim();
    if (clean.length === 0) throw new Error("Workspace name is required.");
    if (clean.length > 60) throw new Error("Workspace name is too long.");

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: clean,
      description: description?.trim() || undefined,
      createdBy: userId,
      createdAt: now,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      joinedAt: now,
    });
    // every workspace starts with a #general channel
    await ctx.db.insert("channels", {
      workspaceId,
      name: "general",
      createdBy: userId,
      createdAt: now,
    });
    return workspaceId;
  },
});

export const renameWorkspace = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, { workspaceId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const member = await getMembership(ctx, workspaceId, userId);
    if (!canManage(member?.role))
      throw new Error("Only owners and admins can rename the workspace.");
    const clean = name.trim();
    if (clean.length === 0) throw new Error("Workspace name is required.");
    await ctx.db.patch(workspaceId, { name: clean });
  },
});

/** Workspaces the signed-in user belongs to, with role + member count. */
export const listMyWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (memberships.length === 0) return [];

    const workspaces = await Promise.all(
      memberships.map((m) => ctx.db.get(m.workspaceId)),
    );
    const counts = await Promise.all(
      memberships.map(async (m) => {
        const rows = await ctx.db
          .query("workspaceMembers")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", m.workspaceId))
          .collect();
        return rows.length;
      }),
    );

    return memberships
      .map((m, i) => ({
        _id: m.workspaceId,
        name: workspaces[i]?.name ?? "Untitled",
        description: workspaces[i]?.description,
        myRole: m.role,
        memberCount: counts[i],
        createdAt: workspaces[i]?.createdAt ?? 0,
      }))
      .filter((w) => w.name !== "Untitled");
  },
});

/** Full workspace view for members: channels, members (+ presence), my role. */
export const getWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const member = await getMembership(ctx, workspaceId, userId);
    if (!member) return null;

    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) return null;

    const channels = await ctx.db
      .query("channels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const users = await Promise.all(
      memberships.map((m) => ctx.db.get(m.userId)),
    );
    const presenceRows = await ctx.db.query("userPresence").collect();
    const presenceByUser = new Map(presenceRows.map((p) => [p.userId, p]));

    const members = memberships.map((m, i) => {
      const u = users[i];
      const p = presenceByUser.get(m.userId);
      return {
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        name: u?.name ?? "User",
        email: u?.email ?? "",
        image: u?.image,
        status: p?.status ?? "offline",
        lastSeen: p?.lastSeen ?? 0,
      };
    });

    return {
      _id: workspace._id,
      name: workspace.name,
      description: workspace.description,
      myRole: member.role,
      channels: channels.map((c) => ({ _id: c._id, name: c.name })),
      members,
    };
  },
});

/** Invite a registered user by email (owner/admin only). Idempotent. */
export const inviteMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: v.optional(workspaceRole),
  },
  handler: async (ctx, { workspaceId, email, role }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const me = await getMembership(ctx, workspaceId, userId);
    if (!canManage(me?.role))
      throw new Error("Only owners and admins can invite members.");

    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) throw new Error("Enter a valid email address.");

    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Workspace not found.");

    const allUsers = await ctx.db.query("users").collect();
    const target = allUsers.find(
      (u) => u.email?.toLowerCase() === clean && u.isAnonymous !== true,
    );
    if (!target) throw new Error("No VCollab account found for that email.");

    const existing = await getMembership(ctx, workspaceId, target._id);
    if (existing) return { added: false as const, name: target.name ?? "User" };

    const inviteRole: WorkspaceRole = role ?? "member";
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: target._id,
      role: inviteRole,
      joinedAt: Date.now(),
    });
    await ctx.db.insert("notifications", {
      userId: target._id,
      type: "invite",
      title: `Invited to ${workspace.name}`,
      body: `${me?.role === "owner" ? "Owner" : "Admin"} added you as ${inviteRole}.`,
      link: `/workspaces/${workspaceId}`,
      read: false,
      createdAt: Date.now(),
    });
    return { added: true as const, name: target.name ?? "User" };
  },
});

export const updateRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: workspaceRole,
  },
  handler: async (ctx, { workspaceId, userId, role }) => {
    const actor = await getAuthUserId(ctx);
    if (actor === null) throw new Error("Sign in first.");
    const me = await getMembership(ctx, workspaceId, actor);
    if (!canManage(me?.role))
      throw new Error("Only owners and admins can change roles.");

    const target = await getMembership(ctx, workspaceId, userId);
    if (!target) throw new Error("That user is not a member.");

    // only the owner can grant or revoke the owner role
    if (target.role === "owner" || role === "owner") {
      if (me?.role !== "owner")
        throw new Error("Only the owner can change the owner role.");
    }
    // never leave a workspace without an owner
    if (target.role === "owner" && role !== "owner") {
      const owners = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      if (owners.filter((m) => m.role === "owner").length <= 1)
        throw new Error("A workspace must keep at least one owner.");
    }

    await ctx.db.patch(target._id, { role });
  },
});

export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
  },
  handler: async (ctx, { workspaceId, userId }) => {
    const actor = await getAuthUserId(ctx);
    if (actor === null) throw new Error("Sign in first.");
    const me = await getMembership(ctx, workspaceId, actor);
    if (!canManage(me?.role))
      throw new Error("Only owners and admins can remove members.");

    const target = await getMembership(ctx, workspaceId, userId);
    if (!target) throw new Error("That user is not a member.");

    if (target.role === "owner" && me?.role !== "owner")
      throw new Error("Only the owner can remove another owner.");
    if (target.role === "owner") {
      const owners = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      if (owners.filter((m) => m.role === "owner").length <= 1)
        throw new Error("A workspace must keep at least one owner.");
    }

    await ctx.db.delete(target._id);
  },
});
