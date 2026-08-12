import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Submit a support request from the help center (Phase 58). */
export const submitTicket = mutation({
  args: {
    subject: v.string(),
    message: v.string(),
  },
  handler: async (ctx, { subject, message }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to contact support");

    const cleanSubject = subject.trim().slice(0, 120);
    if (cleanSubject.length < 3) throw new Error("Give your request a short subject.");
    const cleanMessage = message.trim().slice(0, 5000);
    if (cleanMessage.length < 10) throw new Error("Tell us a bit more about the issue.");

    await ctx.db.insert("supportTickets", {
      userId,
      subject: cleanSubject,
      message: cleanMessage,
      status: "open",
      createdAt: Date.now(),
    });
  },
});

/** The signed-in user's support requests, newest first. */
export const listMyTickets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("supportTickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});
