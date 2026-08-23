import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { isMeetingMemberOrHost } from "./access";
import { normalizeCode } from "./rooms";

/** Latest AI artifacts for a meeting + kind, newest first.
 *
 *  Meeting data is only readable by the host and current participants:
 *  anyone else gets an empty list, never the content.
 */
export const getAiData = query({
  args: { code: v.string(), kind: v.string() },
  handler: async (ctx, { code, kind }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    const userId = await getAuthUserId(ctx);
    if (!(await isMeetingMemberOrHost(ctx, normalized, userId))) return [];
    return await ctx.db
      .query("aiData")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .filter((q) => q.eq(q.field("kind"), kind))
      .order("desc")
      .take(5);
  },
});

/** Internal: same read without an auth check — server actions call this
 *  after verifying access themselves via assertAiAccess. */
export const getAiDataUnverified = internalQuery({
  args: { code: v.string(), kind: v.string() },
  handler: async (ctx, { code, kind }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("aiData")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .filter((q) => q.eq(q.field("kind"), kind))
      .order("desc")
      .take(5);
  },
});

/** Internal: authorization gate for AI node-actions. The action resolves the
 *  caller's identity with getAuthUserId and passes it here; only the meeting
 *  host or a current participant may run AI features against a meeting. */
export const assertAiAccess = internalQuery({
  args: { code: v.string(), userId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, { code, userId }) => {
    if (!(await isMeetingMemberOrHost(ctx, code, userId)))
      throw new Error(
        "You don't have access to this meeting's AI features. Join the meeting first.",
      );
    return true;
  },
});

/** Latest AI insights across all of the signed-in user's meetings. */
export const getMyAiInsights = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { summaries: [], actionItems: [] };
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .take(100);
    const codes = new Set(rooms.map((r) => r.code));
    const all = await ctx.db.query("aiData").collect();
    const mine = all.filter((a) => codes.has(a.code));
    const summaries = mine
      .filter((a) => a.kind === "summary")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3);
    const actionItems = mine
      .filter((a) => a.kind === "actionItems")
      .sort((a, b) => b.createdAt - a.createdAt)
      .flatMap((a) => a.items ?? [])
      .slice(0, 6);
    return { summaries, actionItems };
  },
});

/** Host of a meeting (used by node actions to notify them). */
export const getRoomHost = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    return room?.createdBy ?? null;
  },
});

/** Internal: persist an AI artifact (keeps only the latest 5). */
export const storeAiData = internalMutation({
  args: {
    code: v.string(),
    kind: v.union(
      v.literal("transcript"),
      v.literal("summary"),
      v.literal("actionItems"),
      v.literal("minutes"),
    ),
    content: v.optional(v.string()),
    items: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiData", {
      code: args.code,
      kind: args.kind,
      content: args.content,
      items: args.items,
      model: args.model,
      createdAt: Date.now(),
    });
    const rows = await ctx.db
      .query("aiData")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .filter((q) => q.eq(q.field("kind"), args.kind))
      .order("desc")
      .collect();
    for (const row of rows.slice(5)) await ctx.db.delete(row._id);
  },
});
