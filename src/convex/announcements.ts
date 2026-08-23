import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMeetingMember } from "./access";
import { normalizeCode } from "./rooms";

/** Send a meeting-wide announcement (host only). */
export const send = mutation({
  args: {
    code: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to send announcements.");

    const text = args.text.trim().slice(0, 500);
    if (!text) throw new Error("Announcement cannot be empty.");

    const normalized = normalizeCode(args.code);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (!room) throw new Error("Meeting not found.");
    if (room.createdBy !== userId) {
      throw new Error("Only the host can send announcements.");
    }

    const user = await ctx.db.get(userId);
    const fromName = user?.name ?? "Host";

    return await ctx.db.insert("announcements", {
      code: normalized,
      from: fromName,
      fromId: userId,
      text,
      createdAt: Date.now(),
    });
  },
});

/** List recent announcements for a meeting.
 *
 *  Only the host or an admitted participant may read a meeting's
 *  announcements; waiting users don't receive meeting-wide messages.
 */
export const list = query({
  args: {
    code: v.string(),
    limit: v.optional(v.number()),
    viewerClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .first();
    const isHost = userId !== null && room !== null && room.createdBy === userId;
    if (!isHost) {
      // Everyone else must prove they're an admitted participant through
      // their unguessable per-tab clientId (verified against presence).
      await requireMeetingMember(ctx, args.code, args.viewerClientId ?? "");
    }

    const limit = Math.min(args.limit ?? 50, 100);
    return await ctx.db
      .query("announcements")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .order("desc")
      .take(limit);
  },
});

/** Clear all announcements for a meeting (host only). */
export const clear = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to clear announcements.");

    const normalized = normalizeCode(args.code);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (!room) throw new Error("Meeting not found.");
    if (room.createdBy !== userId)
      throw new Error("Only the host can clear announcements.");

    const items = await ctx.db
      .query("announcements")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .take(100);
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    return { cleared: items.length };
  },
});
