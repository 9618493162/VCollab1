import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { WorkspaceRole } from "./workspaces";

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60_000; // 7 days

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

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

/** Send an invitation by email. If the user already exists in VCollab, they
 *  get a notification. Either way, a token-based invite link is created so
 *  the recipient can accept later. */
export const sendInvitation = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("guest"),
    ),
  },
  handler: async (ctx, { workspaceId, email, role }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to invite members.");
    const me = await getMembership(ctx, workspaceId, userId);
    if (!canManage(me?.role))
      throw new Error("Only owners and admins can send invitations.");

    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) throw new Error("Enter a valid email address.");

    // check for existing membership
    const allUsers = await ctx.db.query("users").collect();
    const existingUser = allUsers.find(
      (u) => u.email?.toLowerCase() === clean && u.isAnonymous !== true,
    );
    if (existingUser) {
      const alreadyMember = await getMembership(ctx, workspaceId, existingUser._id);
      if (alreadyMember) throw new Error("That user is already a member.");
    }

    // check for pending invitation
    const pending = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .collect();
    const activePending = pending.find(
      (i) => i.workspaceId === workspaceId && i.status === "pending",
    );
    if (activePending) throw new Error("An invitation is already pending for that email.");

    const now = Date.now();
    const token = generateToken();
    await ctx.db.insert("invitations", {
      workspaceId,
      email: clean,
      role,
      token,
      invitedBy: userId,
      status: "pending",
      expiresAt: now + INVITATION_EXPIRY_MS,
      createdAt: now,
    });

    // notify existing user if they're on VCollab
    if (existingUser) {
      const workspace = await ctx.db.get(workspaceId);
      const actor = await ctx.db.get(userId);
      await ctx.db.insert("notifications", {
        userId: existingUser._id,
        type: "invite",
        title: `Invited to ${workspace?.name ?? "a workspace"}`,
        body: `${actor?.name ?? "Someone"} invited you as ${role}.`,
        link: `/workspaces/${workspaceId}`,
        read: false,
        createdAt: now,
      });
    }

    return { token };
  },
});

/** Accept an invitation. If the user is not yet a member, add them. */
export const acceptInvitation = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to accept invitations.");

    const row = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!row) throw new Error("Invitation not found.");
    if (row.status !== "pending") throw new Error(`Invitation already ${row.status}.`);
    if (Date.now() > row.expiresAt) {
      await ctx.db.patch(row._id, { status: "expired" });
      throw new Error("This invitation has expired.");
    }

    const existing = await getMembership(ctx, row.workspaceId, userId);
    if (existing) {
      await ctx.db.patch(row._id, { status: "accepted" });
      throw new Error("You are already a member of this workspace.");
    }

    await ctx.db.insert("workspaceMembers", {
      workspaceId: row.workspaceId,
      userId,
      role: row.role,
      joinedAt: Date.now(),
    });
    await ctx.db.patch(row._id, { status: "accepted" });
    return { workspaceId: row.workspaceId };
  },
});

/** Revoke a pending invitation (admin/owner only). */
export const revokeInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const row = await ctx.db.get(invitationId);
    if (!row) throw new Error("Invitation not found.");
    const me = await getMembership(ctx, row.workspaceId, userId);
    if (!canManage(me?.role))
      throw new Error("Only owners and admins can revoke invitations.");
    if (row.status !== "pending") throw new Error("Invitation is not pending.");
    await ctx.db.patch(invitationId, { status: "revoked" });
  },
});

/** List pending invitations for a workspace (admin/owner only). */
export const listInvitations = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await getMembership(ctx, workspaceId, userId);
    if (!canManage(me?.role)) return [];

    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const invitees = await Promise.all(
      rows.map(async (r) => {
        const users = await ctx.db.query("users").collect();
        const u = users.find((u) => u.email?.toLowerCase() === r.email);
        return { name: u?.name ?? r.email, image: u?.image };
      }),
    );

    return rows
      .map((r, i) => ({
        _id: r._id,
        email: r.email,
        role: r.role,
        status: r.status,
        invitedBy: r.invitedBy,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        inviteeName: invitees[i]?.name ?? r.email,
        inviteeImage: invitees[i]?.image,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Accept an invitation via direct link — for users who already exist. */
export const getInvitationByCode = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!row || row.status !== "pending") return null;
    if (Date.now() > row.expiresAt) return null;
    const workspace = await ctx.db.get(row.workspaceId);
    return {
      workspaceId: row.workspaceId,
      workspaceName: workspace?.name ?? "Unknown",
      role: row.role,
      email: row.email,
    };
  },
});
