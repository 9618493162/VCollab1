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

    // Detect @mentions and notify mentioned users.
    // Pattern: @Name (where Name is 2-40 alphanumeric/underscore chars).
    const mentionPattern = /@([A-Za-z][A-Za-z0-9_]{1,39})/g;
    const mentionedNames = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(content)) !== null) {
      mentionedNames.add(match[1]);
    }
    if (mentionedNames.size > 0) {
      const me = await ctx.db.get(userId);
      const senderName = me?.name || "Someone";
      // Find users in the meeting by presence and notify those matching
      const participants = await ctx.db
        .query("presence")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .collect();
      const code = normalized;
      for (const participant of participants) {
        if (participant.userId && participant.userId !== userId) {
          const pUser = await ctx.db.get(participant.userId);
          const pName = pUser?.name || participant.name;
          if (mentionedNames.has(pName)) {
            // Lazy-import to avoid circular deps; inline create
            await ctx.db.insert("notifications", {
              userId: participant.userId,
              type: "mention",
              title: `${senderName} mentioned you in meeting notes`,
              body: content.slice(0, 200),
              link: `/call/${code}`,
              read: false,
              createdAt: Date.now(),
            });
          }
        }
      }
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

    // Notify the assignee if someone was assigned to this card.
    if (args.assignee) {
      const participants = await ctx.db
        .query("presence")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .collect();
      const me = await ctx.db.get(userId);
      for (const p of participants) {
        if (p.userId && p.userId !== userId) {
          const pUser = await ctx.db.get(p.userId);
          const pName = (pUser?.name || p.name).trim();
          if (pName.toLowerCase() === args.assignee.trim().toLowerCase()) {
            await ctx.db.insert("notifications", {
              userId: p.userId,
              type: "task_assigned",
              title: `${me?.name || "Someone"} assigned you a task`,
              body: title,
              link: `/call/${normalized}`,
              read: false,
              createdAt: Date.now(),
            });
            break;
          }
        }
      }
    }
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

// ─── Shared Links ───────────────────────────────────────────────────────

/** Links shared in a meeting, newest first. */
export const getLinks = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("sharedLinks")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("desc")
      .take(50);
  },
});

/** Add a shared link to the meeting. */
export const addLink = mutation({
  args: {
    code: v.string(),
    title: v.string(),
    url: v.string(),
  },
  handler: async (ctx, { code, title, url }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to share links");
    const normalized = normalizeCode(code);
    const cleanTitle = title.trim().slice(0, 120);
    if (cleanTitle === "") throw new Error("Give the link a title.");
    const cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("Please enter a valid URL.");
    const me = await ctx.db.get(userId);
    await ctx.db.insert("sharedLinks", {
      code: normalized,
      title: cleanTitle,
      url: cleanUrl.slice(0, 2000),
      addedBy: me?.name || "Someone",
      addedById: userId,
      createdAt: Date.now(),
    });
  },
});

/** Remove a shared link (author or host). */
export const removeLink = mutation({
  args: { code: v.string(), linkId: v.id("sharedLinks") },
  handler: async (ctx, { code, linkId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to remove links");
    const normalized = normalizeCode(code);
    const link = await ctx.db.get(linkId);
    if (link === null || link.code !== normalized) throw new Error("Link not found.");
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    const isHost = room?.createdBy === userId;
    const isAuthor = link.addedById === userId;
    if (!isHost && !isAuthor)
      throw new Error("Only the author or the host can remove this link.");
    await ctx.db.delete(linkId);
  },
});
