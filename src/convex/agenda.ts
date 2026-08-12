import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeCode } from "./rooms";

/** Resolve the signed-in user as host of `code`, or throw. */
async function requireHost(ctx: MutationCtx | QueryCtx, code: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to manage the agenda");
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (room === null) throw new Error("Meeting not found.");
  if (room.createdBy !== userId) throw new Error("Only the host can edit the agenda.");
  return userId;
}

/** Host adds an agenda item (appended to the end). */
export const addAgendaItem = mutation({
  args: {
    code: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    presenter: v.optional(v.string()),
  },
  handler: async (ctx, { code, title, description, durationMinutes, presenter }) => {
    const userId = await requireHost(ctx, code);
    const normalized = normalizeCode(code);
    const cleanTitle = title.trim().slice(0, 120);
    if (cleanTitle === "") throw new Error("Give the agenda item a title.");

    const existing = await ctx.db
      .query("agendaItems")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    const position = existing.reduce((max, item) => Math.max(max, item.position), 0) + 1;

    await ctx.db.insert("agendaItems", {
      code: normalized,
      title: cleanTitle,
      description: description?.trim().slice(0, 400) || undefined,
      durationMinutes:
        durationMinutes !== undefined
          ? Math.min(Math.max(Math.round(durationMinutes), 1), 480)
          : undefined,
      presenter: presenter?.trim().slice(0, 60) || undefined,
      status: "pending",
      position,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Host moves an item through the agenda. Marking one item active automatically
 * returns any previously-active item to pending.
 */
export const setAgendaStatus = mutation({
  args: {
    code: v.string(),
    itemId: v.id("agendaItems"),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("done")),
  },
  handler: async (ctx, { code, itemId, status }) => {
    await requireHost(ctx, code);
    const item = await ctx.db.get(itemId);
    if (item === null) throw new Error("Agenda item not found.");

    if (status === "active") {
      const siblings = await ctx.db
        .query("agendaItems")
        .withIndex("by_code", (q) => q.eq("code", item.code))
        .collect();
      for (const sibling of siblings) {
        if (sibling._id !== itemId && sibling.status === "active") {
          await ctx.db.patch(sibling._id, { status: "pending" });
        }
      }
    }
    await ctx.db.patch(itemId, { status });
  },
});

/** Host removes an item and renumbers the rest. */
export const removeAgendaItem = mutation({
  args: { code: v.string(), itemId: v.id("agendaItems") },
  handler: async (ctx, { code, itemId }) => {
    await requireHost(ctx, code);
    const item = await ctx.db.get(itemId);
    if (item === null) throw new Error("Agenda item not found.");
    await ctx.db.delete(itemId);
  },
});

/** The meeting's agenda, in order. Everyone in the meeting can read it. */
export const listAgenda = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("agendaItems")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("asc")
      .take(100);
  },
});
