import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_NAME = 60;
const MAX_NOTE = 240;

/** Every hi the signed-in user has sent, newest first. */
export const listHis = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    return await ctx.db
      .query("his")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Log a new hello. */
export const addHi = mutation({
  args: {
    name: v.string(),
    note: v.optional(v.string()),
    intensity: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to log a hi");

    const name = args.name.trim().slice(0, MAX_NAME);
    if (name.length === 0) throw new Error("Who did you say hi to?");

    const note = args.note?.trim().slice(0, MAX_NOTE) || undefined;
    const intensity = Math.min(5, Math.max(1, Math.round(args.intensity)));

    await ctx.db.insert("his", {
      userId,
      name,
      note,
      intensity,
      createdAt: Date.now(),
    });
  },
});

/** Remove a hello from the record. Only the owner can delete. */
export const deleteHi = mutation({
  args: { id: v.id("his") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage your hi's");

    const entry = await ctx.db.get(id);
    if (entry === null || entry.userId !== userId) {
      throw new Error("That hi doesn't exist");
    }

    await ctx.db.delete(id);
  },
});
