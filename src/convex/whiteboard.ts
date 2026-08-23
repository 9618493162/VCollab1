import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, QueryCtx, query } from "./_generated/server";
import { requireMeetingMember } from "./access";
import { normalizeCode } from "./rooms";

const MAX_POINTS = 2000;
const MAX_STROKES = 500;

async function getHostId(ctx: QueryCtx | MutationCtx, code: string) {
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  return room?.createdBy ?? null;
}

/** Everyone in the meeting can draw; strokes are stored in a logical 1000x600 space. */
export const saveStroke = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    name: v.string(),
    color: v.string(),
    width: v.number(),
    highlighter: v.boolean(),
    points: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeCode(args.code);
    if (normalized === "") throw new Error("Meeting not found.");

    // Validate shape first so callers get the most specific error.
    const { clientId, name, color, width, highlighter, points } = args;
    const clean = points.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 600,
    );
    if (clean.length < 2) throw new Error("A stroke needs at least two points.");
    if (clean.length > MAX_POINTS) throw new Error("That stroke is too long.");
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid color.");
    if (width < 1 || width > 12) throw new Error("Invalid stroke width.");

    // Only admitted participants can draw; stroke attribution (clientId +
    // display name) comes from the verified presence row, never client input.
    const member = await requireMeetingMember(ctx, normalized, clientId);

    // keep the board from growing without bound
    const count = await ctx.db
      .query("whiteboardStrokes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    if (count.length >= MAX_STROKES) {
      const oldest = [...count].sort((a, b) => a.createdAt - b.createdAt)[0];
      await ctx.db.delete(oldest._id);
    }

    await ctx.db.insert("whiteboardStrokes", {
      code: normalized,
      clientId,
      name: member.name.trim().slice(0, 40) || "Guest",
      color,
      width,
      highlighter,
      points: clean,
      createdAt: Date.now(),
    });
  },
});

/** Every stroke on the board, oldest first. Meeting-scoped like the other panels. */
export const listStrokes = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("whiteboardStrokes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("asc")
      .collect();
  },
});

/** Authors can undo their own stroke; the host can remove anything. */
export const deleteStroke = mutation({
  args: {
    code: v.string(),
    strokeId: v.id("whiteboardStrokes"),
    clientId: v.string(),
  },
  handler: async (ctx, { code, strokeId, clientId }) => {
    const normalized = normalizeCode(code);
    const stroke = await ctx.db.get(strokeId);
    if (stroke === null || stroke.code !== normalized) throw new Error("Stroke not found.");

    const userId = await getAuthUserId(ctx);
    let isHost = false;
    if (userId !== null) {
      isHost = (await getHostId(ctx, normalized)) === userId;
    }
    if (stroke.clientId !== clientId && !isHost)
      throw new Error("Only the author or the host can remove that stroke.");

    await ctx.db.delete(strokeId);
  },
});

/** Host clears the whole board. */
export const clearWhiteboard = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to clear the whiteboard");
    const normalized = normalizeCode(code);
    const isHost = (await getHostId(ctx, normalized)) === userId;
    if (!isHost) throw new Error("Only the host can clear the whiteboard.");

    const strokes = await ctx.db
      .query("whiteboardStrokes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    for (const s of strokes) await ctx.db.delete(s._id);
  },
});
