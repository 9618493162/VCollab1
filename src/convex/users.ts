import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/**
 * Search registered, non-guest users by name or email (for invite pickers).
 * Excludes the signed-in user. Best-effort substring match, capped results.
 */
export const searchUsers = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query: raw, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const q = raw.trim().toLowerCase();
    if (q === "") return [];
    const cap = Math.min(Math.max(limit ?? 8, 1), 20);

    const rows = await ctx.db.query("users").collect();
    return rows
      .filter((u) => u._id !== userId && u.isAnonymous !== true)
      .filter((u) => {
        const name = (u.name ?? "").toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, cap)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "User",
        email: u.email ?? "",
        image: u.image,
      }));
  },
});

/**
 * Resolve a list of invitee emails to registered users (for showing names in
 * attendee lists). Unknown addresses are skipped. Requires auth — callers
 * only pass emails they already have access to (e.g. from meetings they
 * host).
 */
export const getUsersByEmails = query({
  args: { emails: v.array(v.string()) },
  handler: async (ctx, { emails }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const wanted = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (wanted.length === 0) return [];

    const rows = await ctx.db.query("users").collect();
    const byEmail = new Map(
      rows
        .filter((u) => u.isAnonymous !== true)
        .map((u) => [u.email?.toLowerCase(), u]),
    );

    return wanted
      .slice(0, 50)
      .flatMap((email) => {
        const u = byEmail.get(email);
        return u
          ? [
              {
                _id: u._id,
                name: u.name ?? "User",
                email: u.email!.toLowerCase(),
                image: u.image,
              },
            ]
          : [];
      });
  },
});
