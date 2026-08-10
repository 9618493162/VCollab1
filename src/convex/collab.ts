import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { normalizeCode } from "./rooms";

const VALID_COLUMNS = ["todo", "inProgress", "review", "done"];

/** Shared notes for a meeting (one doc per meeting, autosaved). */
export const getNotes = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return null;
    return await ctx.db
      .query("notes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
  },
});

export const saveNotes = mutation({
  args: {
    code: v.string(),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, { code, title, content }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to save notes");
    const normalized = normalizeCode(code);
    const existing = await ctx.db
      .query("notes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    const cleanTitle = title.trim().slice(0, 120) || "Meeting notes";
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: cleanTitle,
        content: content.slice(0, 50_000),
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("notes", {
        code: normalized,
        title: cleanTitle,
        content: content.slice(0, 50_000),
        updatedAt: now,
        updatedBy: userId,
      });
    }
  },
});

/** Kanban board for a meeting. */
export const getCards = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("kanbanCards")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
  },
});

export const addCard = mutation({
  args: {
    code: v.string(),
    column: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    priority: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to edit the board");
    const normalized = normalizeCode(args.code);
    if (!VALID_COLUMNS.includes(args.column)) throw new Error("Invalid column.");
    const title = args.title.trim().slice(0, 120);
    if (title === "") throw new Error("Cards need a title.");
    await ctx.db.insert("kanbanCards", {
      code: normalized,
      column: args.column,
      title,
      description: args.description?.trim().slice(0, 1000) || undefined,
      assignee: args.assignee?.trim().slice(0, 60) || undefined,
      dueDate: args.dueDate,
      priority: args.priority,
      labels: (args.labels ?? []).map((l) => l.trim().slice(0, 30)).filter(Boolean).slice(0, 5),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateCard = mutation({
  args: {
    cardId: v.id("kanbanCards"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    priority: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to edit the board");
    const card = await ctx.db.get(args.cardId);
    if (card === null) throw new Error("Card not found.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, 120) || "Untitled";
    if (args.description !== undefined)
      patch.description = args.description.trim().slice(0, 1000) || undefined;
    if (args.assignee !== undefined)
      patch.assignee = args.assignee.trim().slice(0, 60) || undefined;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.labels !== undefined)
      patch.labels = args.labels.map((l) => l.trim().slice(0, 30)).filter(Boolean).slice(0, 5);
    await ctx.db.patch(card._id, patch);
  },
});

/** Move a card between columns (drag & drop). */
export const moveCard = mutation({
  args: { cardId: v.id("kanbanCards"), column: v.string() },
  handler: async (ctx, { cardId, column }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to edit the board");
    if (!VALID_COLUMNS.includes(column)) throw new Error("Invalid column.");
    const card = await ctx.db.get(cardId);
    if (card === null) throw new Error("Card not found.");
    await ctx.db.patch(card._id, { column, updatedAt: Date.now() });
  },
});

export const deleteCard = mutation({
  args: { cardId: v.id("kanbanCards") },
  handler: async (ctx, { cardId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to edit the board");
    const card = await ctx.db.get(cardId);
    if (card === null) throw new Error("Card not found.");
    await ctx.db.delete(card._id);
  },
});
