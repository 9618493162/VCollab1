import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const CHARS = "abcdefghjkmnpqrstuvwxyz"; // no confusing letters (no i, l, o)
const CODE_LENGTH = 10;

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
        await ctx.db.insert("rooms", {
          code,
          createdBy: userId,
          createdAt: Date.now(),
        });
        return code;
      }
    }
    throw new Error("Couldn't generate a code, try again.");
  },
});

/** Look up a room by code (normalized). Returns null if it doesn't exist. */
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
    return { ...room, hostName: host?.name ?? "Host" };
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
