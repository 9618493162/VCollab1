import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── SYSTEM TEMPLATES ─────────────────────────────────────────
const SYSTEM_TEMPLATES = [
  {
    name: "Team Standup",
    description: "Daily sync: what I did, what I'm doing, blockers",
    icon: "🔄",
    agenda: ["Yesterday's progress", "Today's plan", "Blockers"],
    defaultSettings: { allowChat: true, waitingRoom: false },
  },
  {
    name: "Project Meeting",
    description: "Review progress, discuss blockers, plan next steps",
    icon: "📋",
    agenda: ["Project status", "Open issues", "Decisions needed", "Next steps"],
    defaultSettings: { allowChat: true, allowReactions: true },
  },
  {
    name: "Interview",
    description: "Structured candidate interview",
    icon: "🎤",
    agenda: ["Introduction", "Experience review", "Technical assessment", "Questions"],
    defaultSettings: { waitingRoom: true, allowChat: false },
  },
  {
    name: "Client Meeting",
    description: "Client-facing meeting with professional settings",
    icon: "🤝",
    agenda: ["Welcome", "Agenda review", "Presentation", "Discussion", "Next steps"],
    defaultSettings: { waitingRoom: true, allowReactions: false },
  },
  {
    name: "Brainstorming",
    description: "Creative session with open collaboration",
    icon: "💡",
    agenda: ["Topic introduction", "Ideas generation", "Evaluate ideas", "Action items"],
    defaultSettings: { allowChat: true, allowReactions: true },
  },
  {
    name: "Classroom",
    description: "Educational session with teacher controls",
    icon: "🎓",
    agenda: ["Introduction", "Lesson", "Q&A", "Summary"],
    defaultSettings: { waitingRoom: true, allowReactions: true },
  },
  {
    name: "Presentation",
    description: "One-to-many presentation format",
    icon: "📊",
    agenda: ["Welcome", "Presentation", "Q&A", "Wrap-up"],
    defaultSettings: { waitingRoom: true, allowChat: true },
  },
];

/** List all available templates (system + user-created in their workspace). */
export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const systemTemplates = SYSTEM_TEMPLATES.map((t, i) => ({
      _id: `template_system_${i}` as string,
      ...t,
      isSystem: true,
      createdBy: undefined,
      workspaceId: undefined,
      createdAt: 0,
    }));

    // User-created templates
    const userTemplates = userId
      ? await ctx.db
          .query("meetingTemplates")
          .withIndex("by_creator", (q) => q.eq("createdBy", userId))
          .collect()
      : [];

    return [...systemTemplates, ...userTemplates];
  },
});

/** Create a custom meeting template. */
export const createTemplate = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    agenda: v.optional(v.array(v.string())),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to create templates");

    const cleanName = args.name.trim().slice(0, 60);
    if (!cleanName) throw new Error("Template name can't be empty");

    const id = await ctx.db.insert("meetingTemplates", {
      name: cleanName,
      description: args.description?.trim().slice(0, 200),
      icon: args.icon,
      agenda: args.agenda?.map((a) => a.trim().slice(0, 100)),
      isSystem: false,
      createdBy: userId,
      workspaceId: args.workspaceId,
      createdAt: Date.now(),
    });
    return id;
  },
});

/** Delete a user-created template. */
export const deleteTemplate = mutation({
  args: { templateId: v.id("meetingTemplates") },
  handler: async (ctx, { templateId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first");
    const doc = await ctx.db.get(templateId);
    if (!doc) throw new Error("Template not found");
    if (doc.isSystem) throw new Error("Can't delete system templates");
    if (doc.createdBy !== userId) throw new Error("Only the creator can delete this template");
    await ctx.db.delete(templateId);
  },
});

// ─── DEVICE PREFERENCES ───────────────────────────────────────

/** Get the current user's device preferences. */
export const getDevicePreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("userDevicePreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return row ?? null;
  },
});

/** Save the current user's device preferences. */
export const saveDevicePreferences = mutation({
  args: {
    lastMicDeviceId: v.optional(v.string()),
    lastCamDeviceId: v.optional(v.string()),
    lastSpeakerDeviceId: v.optional(v.string()),
    joinWithMic: v.boolean(),
    joinWithCam: v.boolean(),
    backgroundMode: v.optional(v.union(
      v.literal("none"),
      v.literal("blur"),
      v.literal("image"),
    )),
    backgroundUrl: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;

    const existing = await ctx.db
      .query("userDevicePreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const data = {
      userId,
      lastMicDeviceId: args.lastMicDeviceId,
      lastCamDeviceId: args.lastCamDeviceId,
      lastSpeakerDeviceId: args.lastSpeakerDeviceId,
      joinWithMic: args.joinWithMic,
      joinWithCam: args.joinWithCam,
      backgroundMode: args.backgroundMode ?? "none",
      backgroundUrl: args.backgroundUrl,
      displayName: args.displayName?.trim().slice(0, 40),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("userDevicePreferences", data);
    }
  },
});

// ─── FOLLOW-UPS ───────────────────────────────────────────────

/** Save a generated follow-up. */
export const saveFollowUp = mutation({
  args: {
    code: v.string(),
    type: v.string(),
    content: v.string(),
  },
  handler: async (ctx, { code, type, content }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first");

    const clean = content.trim().slice(0, 5000);
    if (!clean) throw new Error("Follow-up content can't be empty");

    return await ctx.db.insert("meetingFollowUps", {
      code,
      userId,
      type,
      content: clean,
      createdAt: Date.now(),
    });
  },
});

/** List follow-ups for a meeting (user's own). */
export const listFollowUps = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("meetingFollowUps")
      .withIndex("by_code_user", (q) => q.eq("code", code).eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

// ─── INSIGHTS ─────────────────────────────────────────────────

/** Save meeting insights. */
export const saveInsights = mutation({
  args: {
    code: v.string(),
    summary: v.optional(v.string()),
    keyDecisions: v.optional(v.array(v.string())),
    actionItems: v.optional(v.array(v.object({
      task: v.string(),
      assignee: v.optional(v.string()),
      deadline: v.optional(v.string()),
    }))),
    unresolvedQuestions: v.optional(v.array(v.string())),
    nextSteps: v.optional(v.array(v.string())),
    stats: v.optional(v.object({
      durationMs: v.optional(v.number()),
      participantCount: v.optional(v.number()),
      messageCount: v.optional(v.number()),
      questionCount: v.optional(v.number()),
      taskCount: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first");

    // Upsert: replace existing insights for this meeting
    const existing = await ctx.db
      .query("meetingInsights")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    const data = {
      code: args.code,
      summary: args.summary?.trim().slice(0, 4000),
      keyDecisions: args.keyDecisions,
      actionItems: args.actionItems,
      unresolvedQuestions: args.unresolvedQuestions,
      nextSteps: args.nextSteps,
      stats: args.stats,
      generatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("meetingInsights", data);
  },
});

/** Get meeting insights. */
export const getInsights = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("meetingInsights")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
  },
});
