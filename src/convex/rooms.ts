import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { INSTANT_MEETING_TTL_MS } from "./meetings";

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // A-Z + 2-9 (no 0,1,I,L,O)
const OLD_CODE_LENGTH = 10; // legacy abc-defg-hij
const NEW_CODE_LENGTH = 6; // VC-XXXXXX

/** Secure per-meeting credential for shareable links (?t=...). */
export function generateJoinToken(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 24; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Encode as hex string
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return `t_${hex}`;
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

/** Generates a cryptographically secure meeting code like "VC-7K4P9X". */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(NEW_CODE_LENGTH);
  // Prefer Web Crypto API (available in Convex runtime and modern browsers)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback: still better than Math.random — uses multiple Date + Math
    for (let i = 0; i < NEW_CODE_LENGTH; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let s = "";
  for (let i = 0; i < NEW_CODE_LENGTH; i++) {
    s += CHARS[bytes[i] % CHARS.length];
  }
  return `VC-${s}`;
}

/**
 * Normalizes user input into a canonical meeting code.
 * Handles both legacy "abc-defg-hij" (10 chars) and new "VC-XXXXXX" (8 chars) formats.
 * Returns "" if the input doesn't match either format.
 */
export function normalizeCode(input: string): string {
  const flat = input.replace(/[^a-zA-Z0-9]/g, "");

  // New format: VC-XXXXXX (8 chars after stripping hyphens, starts with VC)
  if (flat.length >= 8 && flat.toUpperCase().startsWith("VC")) {
    const body = flat.slice(2, 8).toUpperCase();
    if (body.length === 6) return `VC-${body}`;
  }

  // Legacy format: abc-defg-hij (10 chars)
  if (flat.length >= OLD_CODE_LENGTH) {
    const body = flat.slice(0, OLD_CODE_LENGTH).toLowerCase();
    return `${body.slice(0, 3)}-${body.slice(3, 7)}-${body.slice(7)}`;
  }

  return "";
}

/** Create a new meeting room and return its shareable code. */
export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to start a meeting");

    for (let attempt = 0; attempt < 10; attempt++) {
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
        // Audit log
        const user = await ctx.db.get(userId);
        await ctx.db.insert("auditLog", {
          action: "meeting.created",
          actorId: userId,
          actorName: user?.name,
          targetId: code,
          targetType: "meeting",
          meta: { expiresAt },
          createdAt: now,
        });
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
