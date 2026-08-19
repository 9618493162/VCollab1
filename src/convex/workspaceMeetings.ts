import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, MutationCtx, QueryCtx, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  generateJoinToken,
  generateRoomCode,
  scheduleExpirySweep,
} from "./rooms";
import {
  occurrenceTimes,
  SCHEDULED_MEETING_GRACE_MS,
} from "./meetings";

const recurrenceValidator = v.optional(
  v.object({
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    interval: v.number(),
    daysOfWeek: v.optional(v.array(v.number())),
    endType: v.union(
      v.literal("never"),
      v.literal("after"),
      v.literal("on"),
    ),
    endAfter: v.optional(v.number()),
    endDate: v.optional(v.number()),
  }),
);

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
) {
  const rows = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  return rows.find((r) => r.userId === userId) ?? null;
}

/**
 * Schedule a meeting that belongs to a workspace (Phase 60). Any member
 * (owner/admin/member) can schedule; guests can't. The meeting gets a real
 * room + scheduledMeetings row (with recurrence materialized like the
 * dashboard scheduler), an announcement post in #general, and a notification
 * for every other member.
 */
export const scheduleWorkspaceMeeting = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    durationMinutes: v.number(),
    recurrence: recurrenceValidator,
  },
  handler: async (ctx, { workspaceId, title, description, startTime, durationMinutes, recurrence }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to schedule a meeting");
    const member = await getMembership(ctx, workspaceId, userId);
    if (member === null) throw new Error("You are not a member of this workspace.");
    if (member.role === "guest") throw new Error("Guests can't schedule meetings.");

    const workspace = await ctx.db.get(workspaceId);
    if (workspace === null) throw new Error("Workspace not found.");

    const cleanTitle = title.trim().slice(0, 80) || "Untitled meeting";
    const cleanDesc = (description ?? "").trim().slice(0, 400);
    const duration = Math.min(Math.max(Math.round(durationMinutes), 5), 480);

    const times =
      recurrence === undefined ? [startTime] : occurrenceTimes(startTime, recurrence, 52);
    const seriesId =
      recurrence === undefined
        ? undefined
        : `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    let firstCode = "";
    for (let i = 0; i < times.length; i++) {
      const occTime = times[i];

      let code = "";
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateRoomCode();
        const existing = await ctx.db
          .query("rooms")
          .withIndex("by_code", (q) => q.eq("code", candidate))
          .first();
        if (existing === null) {
          code = candidate;
          break;
        }
      }
      if (code === "") throw new Error("Couldn't generate a code, try again.");

      const expiresAt = occTime + duration * 60_000 + SCHEDULED_MEETING_GRACE_MS;
      await ctx.db.insert("rooms", {
        code,
        createdBy: userId,
        createdAt: Date.now(),
        title: cleanTitle,
        status: "scheduled",
        expiresAt,
        joinToken: generateJoinToken(),
        locked: false,
      });
      await scheduleExpirySweep(ctx, expiresAt);

      await ctx.db.insert("scheduledMeetings", {
        code,
        hostId: userId,
        workspaceId,
        title: cleanTitle,
        description: cleanDesc || undefined,
        startTime: occTime,
        durationMinutes: duration,
        status: "scheduled",
        recurrence:
          recurrence !== undefined && seriesId !== undefined
            ? { ...recurrence, seriesId }
            : undefined,
        createdAt: Date.now(),
      });

      if (firstCode === "") firstCode = code;

      // reminder ~10 minutes before each occurrence (best-effort)
      const delay = occTime - 10 * 60_000 - Date.now();
      if (delay > 0) {
        try {
          await ctx.scheduler.runAfter(
            Math.min(delay, 7 * 24 * 60 * 60_000),
            internal.meetings.remindScheduled,
            { code },
          );
        } catch {
          // reminders are best-effort
        }
      }
    }

    const me = await ctx.db.get(userId);
    const when = new Date(startTime).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // announce in #general so the team sees it in the channel feed
    const general = await ctx.db
      .query("channels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("name"), "general"))
      .first();
    if (general !== null) {
      await ctx.db.insert("channelMessages", {
        channelId: general._id,
        userId,
        userName: me?.name ?? "Someone",
        text: `📅 Scheduled: ${cleanTitle} — ${when} (${duration} min) · code ${firstCode}`,
        createdAt: Date.now(),
      });
    }

    // notify the rest of the team
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    for (const m of members) {
      if (m.userId === userId) continue;
      await ctx.db.insert("notifications", {
        userId: m.userId,
        type: "meeting",
        title: `New meeting in ${workspace.name}`,
        body: `${cleanTitle} — ${when}`,
        link: `/call/${firstCode}`,
        read: false,
        createdAt: Date.now(),
      });
    }

    return firstCode;
  },
});

/**
 * Meetings scheduled in a workspace (upcoming + past), oldest-start first.
 * Members only — the same rule as the rest of the workspace.
 */
export const listWorkspaceMeetings = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const member = await getMembership(ctx, workspaceId, userId);
    if (member === null) return [];

    const rows = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const hosts = new Map<string, string>();
    for (const r of rows) {
      if (!hosts.has(r.hostId)) {
        const u = await ctx.db.get(r.hostId);
        hosts.set(r.hostId, u?.name ?? "Someone");
      }
    }

    return rows
      .map((r) => ({
        _id: r._id,
        code: r.code,
        title: r.title,
        description: r.description,
        startTime: r.startTime,
        durationMinutes: r.durationMinutes,
        status: r.status,
        hostName: hosts.get(r.hostId) ?? "Someone",
        isMine: r.hostId === userId,
        recurring: r.recurrence !== undefined,
      }))
      .sort((a, b) => a.startTime - b.startTime);
  },
});
