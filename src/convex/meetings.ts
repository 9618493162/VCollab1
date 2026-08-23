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
import { generateJoinToken, generateRoomCode, normalizeCode, scheduleExpirySweep } from "./rooms";
import { createNotification } from "./notifications";

async function getRoomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Meeting expiration policy (ms). Instant rooms live 24h from creation; a
// scheduled meeting stays joinable until 24h after its scheduled end time.
// These are hard caps — ending always invalidates immediately regardless.
export const INSTANT_MEETING_TTL_MS = 24 * 60 * 60_000;
export const SCHEDULED_MEETING_GRACE_MS = 24 * 60 * 60_000;

/** Whether a room status is a terminal (non-joinable) state. */
export function isTerminalStatus(status?: string): boolean {
  return status === "ended" || status === "cancelled" || status === "expired";
}

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

export type RecurrenceInput = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  daysOfWeek?: number[];
  endType: "never" | "after" | "on";
  endAfter?: number;
  endDate?: number;
};

/** Human label for a recurrence rule, e.g. "every 2 weeks". */
export function recurrenceLabel(r: {
  frequency: string;
  interval?: number;
}): string {
  const n = Math.max(1, r.interval ?? 1);
  switch (r.frequency) {
    case "daily":
      return n === 1 ? "daily" : `every ${n} days`;
    case "weekly":
      return n === 1 ? "weekly" : `every ${n} weeks`;
    case "monthly":
      return n === 1 ? "monthly" : `every ${n} months`;
    default:
      return "repeats";
  }
}

/**
 * Expand a recurrence rule into concrete start times (epoch ms) beginning at
 * `startTime`. Occurrences are capped so bookings can't explode.
 */
export function occurrenceTimes(
  startTime: number,
  recurrence: RecurrenceInput,
  cap = 52,
): number[] {
  const interval = Math.max(1, recurrence.interval || 1);
  const endDate = recurrence.endDate ?? undefined;
  const out: number[] = [];
  const start = new Date(startTime);
  const hour = start.getHours();
  const minute = start.getMinutes();

  const within = (t: number) =>
    t >= startTime && (endDate === undefined || t <= endDate);
  const push = (t: number) => {
    if (within(t)) out.push(t);
  };

  if (recurrence.frequency === "weekly" && recurrence.daysOfWeek?.length) {
    const days = [
      ...new Set(recurrence.daysOfWeek.map((d) => ((d % 7) + 7) % 7)),
    ].sort();
    // Monday of the week containing startTime.
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    for (let w = 0; w < 520 && out.length < cap; w++) {
      const week = new Date(weekStart);
      week.setDate(weekStart.getDate() + w * interval * 7);
      for (const day of days) {
        if (out.length >= cap) break;
        const cand = new Date(week);
        cand.setDate(week.getDate() + day);
        cand.setHours(hour, minute, 0, 0);
        push(cand.getTime());
      }
    }
  } else if (recurrence.frequency === "monthly") {
    for (let i = 0; i < 520 && out.length < cap; i++) {
      const cand = new Date(start);
      cand.setDate(1);
      cand.setMonth(cand.getMonth() + i * interval);
      const last = new Date(cand.getFullYear(), cand.getMonth() + 1, 0).getDate();
      cand.setDate(Math.min(start.getDate(), last));
      cand.setHours(hour, minute, 0, 0);
      push(cand.getTime());
    }
  } else {
    // daily, or weekly without specific weekdays
    const step = recurrence.frequency === "daily" ? 86_400_000 : 7 * 86_400_000;
    for (let i = 0; i < 520 && out.length < cap; i++) {
      push(startTime + i * interval * step);
    }
  }

  const limit =
    recurrence.endType === "after" && recurrence.endAfter !== undefined
      ? recurrence.endAfter
      : undefined;
  return limit !== undefined && limit > 0 ? out.slice(0, limit) : out;
}

/** Registered users matching the given emails (best-effort lookup). */
export async function usersByEmails(ctx: MutationCtx | QueryCtx, emails: string[]) {
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
    recurrence: v.optional(
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
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to schedule a meeting");

    const { title, description, startTime, durationMinutes, attendees, recurrence } =
      args;
    const cleanTitle = title.trim().slice(0, 80) || "Untitled meeting";
    const cleanDesc = (description ?? "").trim().slice(0, 400);
    const duration = Math.min(Math.max(Math.round(durationMinutes), 5), 480);
    const emails = normalizeEmails(attendees ?? []);

    // Recurring meetings are materialized as one room + scheduled row per
    // occurrence, all sharing a seriesId (Phase 47).
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
        title: cleanTitle,
        description: cleanDesc || undefined,
        startTime: occTime,
        durationMinutes: duration,
        attendees: emails.length > 0 ? emails : undefined,
        status: "scheduled",
        recurrence:
          recurrence !== undefined && seriesId !== undefined
            ? { ...recurrence, seriesId }
            : undefined,
        createdAt: Date.now(),
      });

      if (firstCode === "") firstCode = code;

      // Reminder ~10 minutes before each occurrence (best-effort; skipped
      // when the meeting is too far out or the scheduler is unavailable).
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

    // Invite notifications + email only for the first occurrence, so a
    // weekly series doesn't spam the same invite 52 times (best-effort).
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
        body: `${when} · code ${firstCode}`,
        link: `/call/${firstCode}`,
      });
    }

    try {
      await ctx.scheduler.runAfter(0, internal.emails.sendMeetingEmail, {
        code: firstCode,
        kind: "invite",
        title: cleanTitle,
        startTime,
        durationMinutes: duration,
        description: cleanDesc || undefined,
        attendees: emails,
      });
    } catch {
      // email is best-effort
    }

    return firstCode;
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

    // Reminder email to everyone on the list (best-effort).
    try {
      await ctx.scheduler.runAfter(0, internal.emails.sendMeetingEmail, {
        code: normalized,
        kind: "reminder",
        title: scheduled.title,
        startTime: scheduled.startTime,
        durationMinutes: scheduled.durationMinutes,
        description: scheduled.description,
        attendees: scheduled.attendees ?? [],
      });
    } catch {
      // email is best-effort
    }
  },
});

/**
 * Cancel a scheduled meeting (host only). With scope: "series" and a meeting
 * that belongs to a recurring series, every future occurrence is cancelled.
 */
export const cancelScheduled = mutation({
  args: {
    code: v.string(),
    scope: v.optional(v.union(v.literal("this"), v.literal("series"))),
  },
  handler: async (ctx, { code, scope }) => {
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

    const cancelled: Array<{
      code: string;
      title: string;
      description?: string;
      startTime: number;
      durationMinutes: number;
      attendees?: string[];
    }> = [];

    const patchCancelled = async (m: Doc<"scheduledMeetings">) => {
      if (m.status === "cancelled") return;
      await ctx.db.patch(m._id, { status: "cancelled" });
      const room = await getRoomByCode(ctx, m.code);
      if (room && room.createdBy === userId) {
        await ctx.db.patch(room._id, { status: "ended" });
      }
      cancelled.push({
        code: m.code,
        title: m.title,
        description: m.description,
        startTime: m.startTime,
        durationMinutes: m.durationMinutes,
        attendees: m.attendees,
      });
    };

    if (scope === "series" && scheduled.recurrence !== undefined) {
      const all = await ctx.db
        .query("scheduledMeetings")
        .withIndex("by_series", (q) =>
          q.eq("recurrence.seriesId", scheduled.recurrence!.seriesId),
        )
        .collect();
      for (const m of all) await patchCancelled(m);
    } else {
      await patchCancelled(scheduled);
    }

    if (cancelled.length === 0) return;

    // Notify + email for the first cancelled occurrence only (best-effort,
    // avoids spamming attendees for every occurrence of a cancelled series).
    const first = cancelled[0];
    const when = new Date(first.startTime).toLocaleString();
    for (const u of await usersByEmails(ctx, first.attendees ?? [])) {
      const wantsCancels = await ctx.runQuery(internal.settings.shouldNotify, {
        userId: u._id,
        type: "invite",
      });
      if (!wantsCancels) continue;
      await createNotification(ctx, {
        userId: u._id,
        type: "meeting",
        title: `Cancelled: ${first.title}${cancelled.length > 1 ? " (series)" : ""}`,
        body: `${when} is no longer happening.`,
      });
    }

    try {
      await ctx.scheduler.runAfter(0, internal.emails.sendMeetingEmail, {
        code: first.code,
        kind: "cancelled",
        title: first.title,
        startTime: first.startTime,
        durationMinutes: first.durationMinutes,
        description: first.description,
        attendees: first.attendees ?? [],
      });
    } catch {
      // email is best-effort
    }
  },
});

/**
 * Edit a recurring series (host only): updates title/description/duration on
 * every non-cancelled occurrence and optionally shifts all future start times
 * by the same delta. Returns the number of occurrences updated.
 */
export const editSeries = mutation({
  args: {
    code: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    startTime: v.optional(v.number()),
  },
  handler: async (ctx, { code, title, description, durationMinutes, startTime }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage meetings");
    const normalized = normalizeCode(code);
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled === null) throw new Error("Scheduled meeting not found.");
    if (scheduled.hostId !== userId)
      throw new Error("Only the host can edit this series.");
    const seriesId = scheduled.recurrence?.seriesId;
    if (seriesId === undefined)
      throw new Error("This meeting isn't part of a recurring series.");

    const all = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_series", (q) => q.eq("recurrence.seriesId", seriesId))
      .collect();

    const cleanTitle =
      title !== undefined
        ? title.trim().slice(0, 80) || "Untitled meeting"
        : undefined;
    const cleanDesc =
      description !== undefined ? description.trim().slice(0, 400) : undefined;
    const duration =
      durationMinutes !== undefined
        ? Math.min(Math.max(Math.round(durationMinutes), 5), 480)
        : undefined;

    // Shifting the series by the delta from the anchor occurrence keeps the
    // whole series' rhythm intact.
    const delta = startTime !== undefined ? startTime - scheduled.startTime : 0;

    let updated = 0;
    for (const m of all) {
      if (m.status === "cancelled") continue;
      await ctx.db.patch(m._id, {
        ...(cleanTitle !== undefined ? { title: cleanTitle } : {}),
        ...(cleanDesc !== undefined ? { description: cleanDesc || undefined } : {}),
        ...(duration !== undefined ? { durationMinutes: duration } : {}),
        ...(delta !== 0 ? { startTime: m.startTime + delta } : {}),
      });
      if (cleanTitle !== undefined || delta !== 0) {
        const room = await getRoomByCode(ctx, m.code);
        if (room && room.createdBy === userId) {
          await ctx.db.patch(room._id, {
            ...(cleanTitle !== undefined ? { title: cleanTitle } : {}),
          });
        }
      }
      updated++;
    }
    return updated;
  },
});

/**
 * Host adds attendees to an already-scheduled meeting. Newly added people get
 * an in-app invite and an email invite; existing attendees are left alone
 * (use resendInvites to re-email everyone). Returns the number added.
 */
export const addAttendees = mutation({
  args: {
    code: v.string(),
    emails: v.array(v.string()),
  },
  handler: async (ctx, { code, emails }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to manage meetings");
    const normalized = normalizeCode(code);
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled === null) throw new Error("Scheduled meeting not found.");
    if (scheduled.hostId !== userId)
      throw new Error("Only the host can add attendees.");
    if (scheduled.status !== "scheduled")
      throw new Error("This meeting is no longer accepting new attendees.");

    const me = await ctx.db.get(userId);
    const hostEmail = me?.email?.toLowerCase();
    const existing = scheduled.attendees ?? [];
    const fresh = normalizeEmails(emails).filter(
      (e) => e !== hostEmail && !existing.includes(e),
    );
    if (fresh.length === 0) return 0;

    await ctx.db.patch(scheduled._id, {
      attendees: [...existing, ...fresh].slice(0, 20),
    });

    // In-app invites for registered users who are newly added (best-effort).
    const when = new Date(scheduled.startTime).toLocaleString();
    for (const u of await usersByEmails(ctx, fresh)) {
      const wantsInvites = await ctx.runQuery(internal.settings.shouldNotify, {
        userId: u._id,
        type: "invite",
      });
      if (!wantsInvites) continue;
      await createNotification(ctx, {
        userId: u._id,
        type: "invite",
        title: `You're invited: ${scheduled.title}`,
        body: `${when} · code ${normalized}`,
        link: `/call/${normalized}`,
      });
    }

    // Email invite to the newly added people only (best-effort).
    try {
      await ctx.scheduler.runAfter(0, internal.emails.sendMeetingEmail, {
        code: normalized,
        kind: "invite",
        title: scheduled.title,
        startTime: scheduled.startTime,
        durationMinutes: scheduled.durationMinutes,
        description: scheduled.description,
        attendees: fresh,
      });
    } catch {
      // email is best-effort
    }

    return fresh.length;
  },
});

/**
 * Host re-sends the invite email to every current attendee (handy when
 * someone lost the link or the details changed). Returns the number emailed.
 */
export const resendInvites = mutation({
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
      throw new Error("Only the host can re-send invites.");
    if (scheduled.status !== "scheduled")
      throw new Error("This meeting is no longer accepting invites.");

    const attendees = scheduled.attendees ?? [];
    try {
      await ctx.scheduler.runAfter(0, internal.emails.sendMeetingEmail, {
        code: normalized,
        kind: "invite",
        title: scheduled.title,
        startTime: scheduled.startTime,
        durationMinutes: scheduled.durationMinutes,
        description: scheduled.description,
        attendees,
      });
    } catch {
      // email is best-effort
    }
    return attendees.length;
  },
});

/**
 * Record an invitee's response (yes / no / maybe) for a scheduled meeting.
 * Only invited attendees can respond. The host is notified when someone
 * says yes (best-effort, respects their notification preferences).
 */
export const respondRsvp = mutation({
  args: {
    code: v.string(),
    status: v.union(v.literal("yes"), v.literal("no"), v.literal("maybe")),
  },
  handler: async (ctx, { code, status }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to respond");
    const normalized = normalizeCode(code);
    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (scheduled === null) throw new Error("Scheduled meeting not found.");
    if (scheduled.status !== "scheduled")
      throw new Error("This meeting is no longer accepting responses.");

    const me = await ctx.db.get(userId);
    const email = me?.email?.toLowerCase();
    if (email === undefined || email === "")
      throw new Error("Your account needs an email to respond.");
    const invited = (scheduled.attendees ?? []).includes(email);
    if (!invited) throw new Error("You weren't invited to this meeting.");

    const existing = (scheduled.rsvps ?? []).filter((r) => r.email !== email);
    const rsvps = [...existing, { email, status, respondedAt: Date.now() }];
    await ctx.db.patch(scheduled._id, { rsvps });

    // Let the host know who's coming (best-effort).
    if (status === "yes") {
      const wants = await ctx.runQuery(internal.settings.shouldNotify, {
        userId: scheduled.hostId,
        type: "invite",
      });
      if (wants) {
        await createNotification(ctx, {
          userId: scheduled.hostId,
          type: "meeting",
          title: `${me?.name ?? email} is coming to ${scheduled.title}`,
          body: `${new Date(scheduled.startTime).toLocaleString()} · code ${normalized}`,
          link: `/call/${normalized}`,
        });
      }
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

    // Idempotent: a double-click or retried request must not error out or
    // re-run cleanup. An already-ended meeting simply stays ended.
    if (room.status === "ended") return;

    const now = Date.now();
    const cutoff = now - 45_000; // only count live presence rows
    const present = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    const live = present.filter(
      (p) => p.lastSeen >= cutoff && p.waiting !== true,
    );

    // End the meeting for everyone, for good:
    //  - status flips to ended (authoritative)
    //  - expiresAt moves to now so even a stray join is rejected
    //  - the join token is revoked, so saved ?t= links die instantly
    //  - presence rows are cleared so nobody lingers and the LiveKit
    //    recording room empties (cloud egress finalizes on its own)
    await ctx.db.patch(room._id, {
      status: "ended",
      endedAt: now,
      endedBy: userId,
      expiresAt: now,
      joinToken: undefined,
      participantCount: Math.max(live.length, 1),
    });
    for (const p of present) await ctx.db.delete(p._id);

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

    // Audit log
    const actor = await ctx.db.get(userId);
    await ctx.db.insert("auditLog", {
      action: "meeting.ended",
      actorId: userId,
      actorName: actor?.name,
      targetId: normalized,
      targetType: "meeting",
      meta: { participantCount: Math.max(live.length, 1) },
      createdAt: now,
    });
  },
});

/**
 * Transfer hosting to another signed-in participant (host only). The new host
 * becomes the only account that can end the meeting; the previous host drops
 * to a normal participant unless they're also a co-host.
 */
export const transferHost = mutation({
  args: { code: v.string(), targetUserId: v.id("users") },
  handler: async (ctx, { code, targetUserId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to transfer hosting");
    const normalized = normalizeCode(code);
    const room = await getRoomByCode(ctx, normalized);
    if (room === null) throw new Error("Meeting not found.");
    if (room.createdBy !== userId)
      throw new Error("Only the host can transfer ownership.");
    if (isTerminalStatus(room.status))
      throw new Error("This meeting is no longer active.");
    if (targetUserId === userId) throw new Error("You're already the host.");

    const present = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    if (!present.some((p) => p.userId === targetUserId))
      throw new Error("That person isn't in the meeting.");

    await ctx.db.patch(room._id, { createdBy: targetUserId });
    const now = Date.now();
    await ctx.db.insert("signals", {
      code: normalized,
      from: userId,
      to: "*",
      kind: "host",
      payload: JSON.stringify({ hostId: targetUserId }),
      createdAt: now,
    });

    // Audit log
    const actor = await ctx.db.get(userId);
    const target = await ctx.db.get(targetUserId);
    await ctx.db.insert("auditLog", {
      action: "host.transferred",
      actorId: userId,
      actorName: actor?.name,
      targetId: normalized,
      targetType: "meeting",
      meta: { newHostName: target?.name, newHostId: targetUserId },
      createdAt: now,
    });
  },
});

/**
 * Background sweep that flips abandoned meetings to `expired`. Runs on a
 * self-scheduling loop: after cleaning up, it re-arms itself to the next
 * soonest expiry (capped at 7 days), or stops when nothing is pending.
 */
export const expireStaleMeetings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rooms = await ctx.db
      .query("rooms")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "scheduled"),
          q.eq(q.field("status"), "active"),
        ),
      )
      .take(500);

    let expired = 0;
    let next = Number.POSITIVE_INFINITY;
    for (const room of rooms) {
      if (room.expiresAt === undefined) continue;
      if (room.expiresAt <= now) {
        await ctx.db.patch(room._id, {
          status: "expired",
          endedAt: now,
          expiresAt: now,
          joinToken: undefined,
        });
        const scheduled = await ctx.db
          .query("scheduledMeetings")
          .withIndex("by_code", (q) => q.eq("code", room.code))
          .first();
        if (scheduled && !isTerminalStatus(scheduled.status)) {
          await ctx.db.patch(scheduled._id, { status: "expired" });
        }
        const present = await ctx.db
          .query("presence")
          .withIndex("by_code", (q) => q.eq("code", room.code))
          .collect();
        for (const p of present) await ctx.db.delete(p._id);
        expired++;
      } else if (room.expiresAt < next) {
        next = room.expiresAt;
      }
    }

    // Re-arm the sweep for the next room that can expire (or stop entirely
    // when nothing is left — new meetings re-arm it when they're created).
    if (expired > 0 || next !== Number.POSITIVE_INFINITY) {
      if (next === Number.POSITIVE_INFINITY) next = now + 6 * 60 * 60_000;
      const delay = Math.min(Math.max(next - Date.now() + 60_000, 60_000), 7 * 24 * 60 * 60_000);
      try {
        await ctx.scheduler.runAfter(delay, internal.meetings.expireStaleMeetings, {});
      } catch {
        // sweep is best-effort; joinRoom enforces expiry inline too
      }
    }
    return expired;
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
    // Audit log
    const actor = await ctx.db.get(userId);
    await ctx.db.insert("auditLog", {
      action: locked ? "meeting.locked" : "meeting.unlocked",
      actorId: userId,
      actorName: actor?.name,
      targetId: normalized,
      targetType: "meeting",
      createdAt: Date.now(),
    });
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
