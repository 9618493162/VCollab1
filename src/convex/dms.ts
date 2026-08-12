import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

function threadKey(a: Id<"users">, b: Id<"users">) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function getThreadFor(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"dmThreads">,
  userId: Id<"users">,
) {
  const thread = await ctx.db.get(threadId);
  if (!thread || !thread.userIds.includes(userId)) return null;
  return thread;
}

/** Find (or create) the 1:1 thread between me and another user. */
export const getOrCreateThread = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, { otherUserId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    if (otherUserId === userId) throw new Error("You can't message yourself.");

    const other = await ctx.db.get(otherUserId);
    if (!other || other.isAnonymous === true)
      throw new Error("User not found.");

    const key = threadKey(userId, otherUserId);
    const existing = await ctx.db
      .query("dmThreads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("dmThreads", {
      key,
      userIds: [userId, otherUserId],
      createdAt: now,
      lastMessageAt: now,
    });
  },
});

/** My DM threads, newest first, with the other user's info + unread count. */
export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const threads = await ctx.db.query("dmThreads").collect();
    const mine = threads
      .filter((t) => t.userIds.includes(userId))
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    const results = await Promise.all(
      mine.map(async (t) => {
        // `mine` only contains threads the user is in, so a 1:1 thread always
        // has exactly one other participant.
        const otherId = t.userIds.find((id) => id !== userId) as Id<"users">;
        const other = await ctx.db.get(otherId);
        const messages = await ctx.db
          .query("dmMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", t._id))
          .collect();
        const unread = messages.filter(
          (m) => m.fromId !== userId && !m.readBy.includes(userId),
        ).length;
        return {
          _id: t._id,
          otherUser: {
            _id: other?._id ?? otherId,
            name: other?.name ?? "User",
            email: other?.email ?? "",
            image: other?.image,
          },
          lastMessagePreview: t.lastMessagePreview ?? "",
          lastMessageAt: t.lastMessageAt,
          unread,
        };
      }),
    );
    return results;
  },
});

export const sendMessage = mutation({
  args: {
    threadId: v.id("dmThreads"),
    text: v.string(),
  },
  handler: async (ctx, { threadId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to send messages.");
    const thread = await getThreadFor(ctx, threadId, userId);
    if (!thread) throw new Error("Thread not found.");

    const clean = text.trim();
    if (clean.length === 0) throw new Error("Message can't be empty.");
    if (clean.length > 4000) throw new Error("Message is too long.");

    const user = await ctx.db.get(userId);
    const now = Date.now();
    const messageId = await ctx.db.insert("dmMessages", {
      threadId,
      fromId: userId,
      fromName: user?.name ?? "User",
      text: clean,
      createdAt: now,
      readBy: [userId],
    });
    await ctx.db.patch(thread._id, {
      lastMessageAt: now,
      lastMessagePreview: clean,
      lastMessageFrom: userId,
    });
    return messageId;
  },
});

export const listMessages = query({
  args: { threadId: v.id("dmThreads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const thread = await getThreadFor(ctx, threadId, userId);
    if (!thread) return [];

    const rows = await ctx.db
      .query("dmMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    return rows; // ascending, oldest first
  },
});

/** Mark every message in a thread as read by me. */
export const markThreadRead = mutation({
  args: { threadId: v.id("dmThreads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const thread = await getThreadFor(ctx, threadId, userId);
    if (!thread) throw new Error("Thread not found.");

    const messages = await ctx.db
      .query("dmMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    for (const m of messages) {
      if (m.fromId !== userId && !m.readBy.includes(userId)) {
        await ctx.db.patch(m._id, { readBy: [...m.readBy, userId] });
      }
    }
  },
});
