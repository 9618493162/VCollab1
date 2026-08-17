import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { INSTANT_MEETING_TTL_MS } from "./meetings";

const CHARS = "abcdefghjkmnpqrstuvwxyz"; // no confusing letters (no i, l, o)
const CODE_LENGTH = 10;

/** Secure per-meeting credential for shareable links (?t=...). */
export function generateJoinToken(): string {
  const bytes =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : "";
  const fallback = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `t_${(bytes || fallback)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Schedule a background expiry sweep for a room that will eventually lapse. */
export async function scheduleExpirySweep(
  ctx: MutationCtx,
  expiresAt: number,
) {
  try {
    const delay = Math.min(Math.max(expiresAt - Date.now(), 60_000), 7 * 24 * 60 * 60_000);
    await ctx.scheduler.runAfter(delay, internal.meetings.expireStaleMeetings, {});
  } catch {
    // expiry sweep is best-effort; joinRoom also enforces expiresAt inline
  }
}

/** Generates a Google-Meet-style code like "abc-defg-hij". */
export function generateRoomCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
}

/** Normalizes user input into a canonical "abc-defg-hij" code, or "" if invalid. */
export function normalizeCode(input: string): string {
  const flat = input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, CODE_LENGTH);
  if (flat.length < CODE_LENGTH) return "";
  return `${flat.slice(0, 3)}-${flat.slice(3, 7)}-${flat.slice(7)}`;
}

/** Create a new meeting room and return its shareable code. */
export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to start a meeting");

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (existing === null) {
        const now = Date.now();
        const expiresAt = now + INSTANT_MEETING_TTL_MS;
        await ctx.db.insert("rooms", {
          code,
          createdBy: userId,
          createdAt: now,
          status: "active",
          startedAt: now,
          expiresAt,
          joinToken: generateJoinToken(),
          locked: false,
        });
        await scheduleExpirySweep(ctx, expiresAt);
        return code;
      }
    }
    throw new Error("Couldn't generate a code, try again.");
  },
});

/**
 * Look up a room by code (normalized). Returns null if it doesn't exist.
 * Also surfaces an `expired` flag computed from expiresAt so the frontend can
 * show the right screen even before a join attempt flips the stored status
 * (queries can't write, so the actual status flip happens in joinRoom / the
 * expiry sweep).
 */
export const getRoom = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return null;
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null) return null;
    const host = await ctx.db.get(room.createdBy);
    const isTerminal =
      room.status === "ended" ||
      room.status === "cancelled" ||
      room.status === "expired";
    const expiredByTime =
      !isTerminal &&
      room.expiresAt !== undefined &&
      room.expiresAt < Date.now();
    return {
      ...room,
      hostName: host?.name ?? "Host",
      expired: expiredByTime === true ? true : undefined,
    };
  },
});

/** Meetings this user created, newest first. */
export const listMyRooms = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("rooms")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .order("desc")
      .take(40);
  },
});

/** Give a meeting a title. */
export const renameRoom = mutation({
  args: { code: v.string(), title: v.string() },
  handler: async (ctx, { code, title }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to edit a meeting");
    const normalized = normalizeCode(code);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (room === null) throw new Error("Meeting not found.");
    if (room.createdBy !== userId) throw new Error("Only the host can rename this meeting.");
    await ctx.db.patch(room._id, { title: title.trim().slice(0, 80) || undefined });
  },
});

/** Get a URL that the browser can PUT a file into (used for recordings). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to upload recordings");
    return await ctx.storage.generateUploadUrl();
  },
});
