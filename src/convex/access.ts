import { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeCode } from "./rooms";

// Shared authorization helpers.
//
// The meeting room's source of truth for "who is actually here" is the
// `presence` table: rows are created by `joinRoom` (which validates the code,
// join token, lock/waiting-room state) and expire via heartbeat staleness.
// ClientIds are per-tab crypto.randomUUID() values — unguessable — so a live
// presence row matching a caller-supplied clientId is solid proof that this
// caller is genuinely in the meeting.

/**
 * Look up the caller's presence row for a meeting by clientId.
 * Returns null when the code/clientId are empty or no row exists.
 */
export async function getPresenceRow(
  ctx: QueryCtx,
  code: string,
  clientId: string,
): Promise<{
  _id: Id<"presence">;
  clientId: string;
  name: string;
  userId?: Id<"users">;
  waiting?: boolean;
  lastSeen: number;
} | null> {
  const normalized = normalizeCode(code);
  if (normalized === "" || clientId === "") return null;
  const row = await ctx.db
    .query("presence")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .filter((q) => q.eq(q.field("clientId"), clientId))
    .first();
  return row;
}

/**
 * Require an active (non-waiting) meeting member for a write mutation.
 *
 * Throws when:
 *  - the code is malformed ("That meeting code doesn't look right.")
 *  - there is no presence row for this clientId ("Join the meeting …")
 *  - the row is still held in the waiting room
 *  - the row has gone stale (>90s without a heartbeat)
 *
 * Returns the verified presence row so callers can derive identity
 * (name/clientId) from the server-side record instead of trusting input.
 */
export async function requireMeetingMember(
  ctx: QueryCtx,
  code: string,
  clientId: string,
): Promise<{ clientId: string; name: string }> {
  const normalized = normalizeCode(code);
  if (normalized === "")
    throw new Error("That meeting code doesn't look right.");
  if (clientId === "") throw new Error("Join the meeting to do that.");
  const row = await getPresenceRow(ctx, normalized, clientId);
  if (row === null)
    throw new Error(
      "You're not in this meeting — rejoin from the meeting link.",
    );
  // Waiting-room participants must be admitted before they can interact.
  if (row.waiting === true)
    throw new Error("You're still waiting to be admitted by the host.");
  // Stale rows mean the participant actually dropped; heartbeat refreshes
  // every few seconds, so anything older than 90s is gone.
  if (Date.now() - row.lastSeen > 90_000)
    throw new Error("Your connection to the meeting dropped — rejoin.");
  return { clientId: row.clientId, name: row.name };
}

/**
 * Does this signed-in user have access to a meeting's data?
 * True when they are the host OR hold any presence row in the meeting
 * (active or waiting — waiting users may watch, not act).
 */
export async function isMeetingMemberOrHost(
  ctx: QueryCtx,
  code: string,
  userId: Id<"users"> | null,
): Promise<boolean> {
  if (userId === null) return false;
  const normalized = normalizeCode(code);
  if (normalized === "") return false;
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .first();
  if (room !== null && room.createdBy === userId) return true;
  const rows = await ctx.db
    .query("presence")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .filter((q) => q.eq(q.field("userId"), userId))
    .first();
  return rows !== null;
}
