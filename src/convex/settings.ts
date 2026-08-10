import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";

export const DEFAULT_SETTINGS = {
  notifyReminders: true,
  notifyInvites: true,
  notifySummaries: true,
  notifyCollaboration: true,
  language: "en",
  timezone: "UTC",
  joinWithMic: true,
  joinWithCam: true,
};

export type SettingsPrefs = typeof DEFAULT_SETTINGS;

/** The signed-in user's settings, or defaults when unset. */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return DEFAULT_SETTINGS;
    const row = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row === null) return DEFAULT_SETTINGS;
    return {
      notifyReminders: row.notifyReminders,
      notifyInvites: row.notifyInvites,
      notifySummaries: row.notifySummaries,
      notifyCollaboration: row.notifyCollaboration,
      language: row.language ?? "en",
      timezone: row.timezone ?? "UTC",
      joinWithMic: row.joinWithMic,
      joinWithCam: row.joinWithCam,
    };
  },
});

/** Update profile fields (name + avatar image URL). */
export const updateProfile = mutation({
  args: {
    name: v.string(),
    image: v.optional(v.string()),
  },
  handler: async (ctx, { name, image }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to update your profile");

    const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (cleanName === "") throw new Error("Name can't be empty.");

    const cleanImage = (image ?? "").trim().slice(0, 300);
    if (cleanImage !== "" && !/^https?:\/\//i.test(cleanImage)) {
      throw new Error("Profile image must be a URL starting with http(s)://.");
    }

    await ctx.db.patch(userId, {
      name: cleanName,
      image: cleanImage || undefined,
    });
  },
});

/** Partial update of account preferences (upsert per user). */
export const updateSettings = mutation({
  args: {
    notifyReminders: v.optional(v.boolean()),
    notifyInvites: v.optional(v.boolean()),
    notifySummaries: v.optional(v.boolean()),
    notifyCollaboration: v.optional(v.boolean()),
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    joinWithMic: v.optional(v.boolean()),
    joinWithCam: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to update settings");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
      return;
    }

    await ctx.db.insert("userSettings", {
      userId,
      notifyReminders: args.notifyReminders ?? DEFAULT_SETTINGS.notifyReminders,
      notifyInvites: args.notifyInvites ?? DEFAULT_SETTINGS.notifyInvites,
      notifySummaries: args.notifySummaries ?? DEFAULT_SETTINGS.notifySummaries,
      notifyCollaboration:
        args.notifyCollaboration ?? DEFAULT_SETTINGS.notifyCollaboration,
      language: args.language ?? DEFAULT_SETTINGS.language,
      timezone: args.timezone ?? DEFAULT_SETTINGS.timezone,
      joinWithMic: args.joinWithMic ?? DEFAULT_SETTINGS.joinWithMic,
      joinWithCam: args.joinWithCam ?? DEFAULT_SETTINGS.joinWithCam,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Gate used before creating a notification: returns false when the user has
 * opted out of that notification type. Unknown types default to allowed.
 */
export const shouldNotify = internalQuery({
  args: { userId: v.id("users"), type: v.string() },
  handler: async (ctx, { userId, type }) => {
    const row: Doc<"userSettings"> | null = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row === null) return true;
    switch (type) {
      case "reminder":
        return row.notifyReminders;
      case "invite":
        return row.notifyInvites;
      case "ai":
        return row.notifySummaries;
      case "collaboration":
        return row.notifyCollaboration;
      default:
        return true;
    }
  },
});
