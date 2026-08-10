import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { generateRoomCode, normalizeCode } from "./rooms";
import { createNotification } from "./notifications";

async function getRoomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Clean, dedupe, and cap an invitee email list. */
export function normalizeEmails(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const email = entry.trim().toLowerCase();
    if (EMAIL_RE.test(email) && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
    if (out.length >= 20) break;
  }
  return out;
}

/** Registered users matching the given emails (best-effort lookup). */
async function usersByEmails(ctx: MutationCtx | QueryCtx, emails: string[]) {
  const users: Doc<"users">[] = [];
  for (const email of emails) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (user) users.push(user);
  }
  return users;
}

/**
 * Schedule a meeting ahead of time. Creates the joinable room (so the code is
 * live immediately) plus scheduling metadata. Returns the meeting code.
 */
export const scheduleMeeting = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    durationMinutes: v.number(),
    attendees: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { title, description, startTime, durationMinutes, attendees }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to schedule a meeting");

    const cleanTitle = title.trim().slice(0, 80) || "Untitled meeting";
    const cleanDesc = (description ?? "").trim().slice(0, 400);
    const duration = Math.min(Math.max(Math.round(durationMinutes), 5), 480);
    const emails = normalizeEmails(attendees ?? []);

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
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

    await ctx.db.insert("rooms", {
      code,
      createdBy: userId,
      createdAt: Date.now(),
      title: cleanTitle,
      status: "scheduled",
      locked: false,
    });

    await ctx.db.insert("scheduledMeetings", {
      code,
      hostId: userId,
      title: cleanTitle,
      description: cleanDesc || undefined,
      startTime,
      durationMinutes: duration,
      attendees: emails.length > 0 ? emails : undefined,
      status: "scheduled",
      createdAt: Date.now(),
    });

    // Invite registered attendees (best-effort — only users who have an
    // account matching the email get an in-app invitation).
    const host = await ctx.db.get(userId);
    const hostEmail = host?.email?.toLowerCase();
    const invitees = await usersByEmails(ctx, emails.filter((e) => e !== hostEmail));
    const when = new Date(startTime).toLocaleString();
    for (const u of invitees) {
      const wantsInvites = await ctx.runQuery(internal.settings.shouldNotify, {
        userId: u._id,
        type: "invite",
      });
      if (!wantsInvites) continue;
      await createNotification(ctx, {
        userId: u._id,
        type: "invite",
        title: `You're invited: ${cleanTitle}`,
        body: `${when} · code ${code}`,
        link: `/call/${code}`,
      });
    }

    // Reminder ~10 minutes before start (best-effort; skipped when the
    // meeting is too far out to schedule or the scheduler is unavailable).
    const delay = startTime - 10 * 60_000 - Date.now();
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

    return code;
  },
});

/**
 * One-shot job fired ~10 minutes before a scheduled meeting. Notifies the
 * host and any registered attendees. No-ops if the meeting was cancelled.
 */
export const remindScheduled = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled === null || scheduled.status !== "scheduled") return;

    const when = new Date(scheduled.startTime).toLocaleString();
    const hostWants = await ctx.runQuery(internal.settings.shouldNotify, {
      userId: scheduled.hostId,
      type: "reminder",
    });
    if (hostWants) {
      await createNotification(ctx, {
        userId: scheduled.hostId,
        type: "reminder",
        title: `Meeting soon: ${scheduled.title}`,
        body: `${when} · code ${normalized}`,
        link: `/call/${normalized}`,
      });
    }

    for (const u of await usersByEmails(ctx, scheduled.attendees ?? [])) {
      const wantsReminders = await ctx.runQuery(internal.settings.shouldNotify, {
        userId: u._id,
        type: "reminder",
      });
      if (!wantsReminders) continue;
      await createNotification(ctx, {
        userId: u._id,
        type: "reminder",
        title: `Meeting soon: ${scheduled.title}`,
        body: `${when} · code ${normalized}`,
        link: `/call/${normalized}`,
      });
    }
  },
});

/** Cancel a scheduled meeting (host only). */
export const cancelScheduled = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage meetings");
    const normalized = normalizeCode(code);
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled === null) throw new Error("Scheduled meeting not found.");
    if (scheduled.hostId !== userId)
      throw new Error("Only the host can cancel this meeting.");
    await ctx.db.patch(scheduled._id, { status: "cancelled" });
    const room = await getRoomByCode(ctx, normalized);
    if (room && room.createdBy === userId) {
      await ctx.db.patch(room._id, { status: "ended" });
    }

    // Let registered attendees know the meeting is off (best-effort).
    const when = new Date(scheduled.startTime).toLocaleString();
    for (const u of await usersByEmails(ctx, scheduled.attendees ?? [])) {
      const wantsCancels = await ctx.runQuery(internal.settings.shouldNotify, {
        userId: u._id,
        type: "invite",
      });
      if (!wantsCancels) continue;
      await createNotification(ctx, {
        userId: u._id,
        type: "meeting",
        title: `Cancelled: ${scheduled.title}`,
        body: `${when} is no longer happening.`,
      });
    }
  },
});

/** Scheduled meetings this user hosts, future first. */
export const listScheduled = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .order("desc")
      .take(40);
  },
});

/** Upcoming, not-yet-started meetings hosted by this user. */
export const listUpcoming = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .collect();
    return rows
      .filter(
        (m) => m.status === "scheduled" && m.startTime + m.durationMinutes * 60_000 > now,
      )
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 10);
  },
});

/**
 * Upcoming meetings this user was invited to (their email is in the attendee
 * list) but does not host. Lets attendees see and join scheduled meetings
 * without needing the invite link.
 */
export const listInvited = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const email = me?.email?.toLowerCase();
    if (email === undefined || email === "") return [];
    const now = Date.now();
    const rows = await ctx.db.query("scheduledMeetings").collect();
    return rows
      .filter(
        (m) =>
          m.hostId !== userId &&
          m.status === "scheduled" &&
          (m.attendees ?? []).includes(email) &&
          m.startTime + m.durationMinutes * 60_000 > now,
      )
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 10);
  },
});

/** Full meeting history: everything this user has created, newest first. */
export const listHistory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("rooms")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .order("desc")
      .take(100);
  },
});

/** Host ends the meeting for everyone: marks it ended + broadcasts "end". */
export const endMeeting = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to end a meeting");
    const normalized = normalizeCode(code);
    const room = await getRoomByCode(ctx, normalized);
    if (room === null) throw new Error("Meeting not found.");
    if (room.createdBy !== userId)
      throw new Error("Only the host can end the meeting.");

    const now = Date.now();
    await ctx.db.patch(room._id, {
      status: "ended",
      endedAt: now,
    });
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled && scheduled.status !== "cancelled") {
      await ctx.db.patch(scheduled._id, { status: "ended" });
    }

    // tell everyone in the room the meeting is over
    await ctx.db.insert("signals", {
      code: normalized,
      from: userId,
      to: "*",
      kind: "end",
      payload: JSON.stringify({ endedBy: userId }),
      createdAt: now,
    });
  },
});

/** Lock / unlock a meeting so no new participants can join (host only). */
export const lockMeeting = mutation({
  args: { code: v.string(), locked: v.boolean() },
  handler: async (ctx, { code, locked }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to lock a meeting");
    const normalized = normalizeCode(code);
    const room = await getRoomByCode(ctx, normalized);
    if (room === null) throw new Error("Meeting not found.");
    if (room.createdBy !== userId)
      throw new Error("Only the host can lock the meeting.");
    await ctx.db.patch(room._id, { locked });
  },
});

/** True when the signed-in user hosts this meeting. */
export const isHost = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const normalized = normalizeCode(code);
    const room = await getRoomByCode(ctx, normalized);
    return room !== null && room.createdBy === userId;
  },
});
