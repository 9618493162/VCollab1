import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeCode } from "./rooms";

/** Resolve the signed-in user as host of `code`, or throw. */
async function requireHost(ctx: MutationCtx | QueryCtx, code: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to manage polls");
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (room === null) throw new Error("Meeting not found.");
  if (room.createdBy !== userId) throw new Error("Only the host can manage polls.");
  return userId;
}

const POLL_TYPES = ["single", "multiple", "anonymous"] as const;

/** Host creates a poll (draft). Use launchPoll to open it for voting. */
export const createPoll = mutation({
  args: {
    code: v.string(),
    title: v.string(),
    type: v.union(v.literal("single"), v.literal("multiple"), v.literal("anonymous")),
    options: v.array(v.string()),
  },
  handler: async (ctx, { code, title, type, options }) => {
    const userId = await requireHost(ctx, code);
    const normalized = normalizeCode(code);
    const cleanTitle = title.trim().slice(0, 120);
    if (cleanTitle === "") throw new Error("Give the poll a question.");
    const cleanOptions = options
      .map((o) => o.trim().slice(0, 120))
      .filter((o) => o !== "");
    if (cleanOptions.length < 2) throw new Error("A poll needs at least 2 options.");
    if (cleanOptions.length > 8) throw new Error("Keep it to 8 options or fewer.");
    if (!POLL_TYPES.includes(type)) throw new Error("Unsupported poll type.");

    const me = await ctx.db.get(userId);
    await ctx.db.insert("polls", {
      code: normalized,
      title: cleanTitle,
      type,
      options: cleanOptions,
      createdBy: userId,
      createdByName: me?.name,
      createdAt: Date.now(),
      launched: false,
      closed: false,
      showResults: false,
    });
  },
});

/** Host launches a poll so participants can vote. */
export const launchPoll = mutation({
  args: { code: v.string(), pollId: v.id("polls") },
  handler: async (ctx, { code, pollId }) => {
    await requireHost(ctx, code);
    const poll = await ctx.db.get(pollId);
    if (poll === null) throw new Error("Poll not found.");
    await ctx.db.patch(pollId, { launched: true, closed: false });

    // Notify all participants in the meeting about the new poll.
    const participants = await ctx.db
      .query("presence")
      .withIndex("by_code", (q) => q.eq("code", code))
      .collect();
    const hostId = await requireHost(ctx, code);
    const me = await ctx.db.get(hostId);
    for (const p of participants) {
      if (p.userId && p.userId !== me?._id) {
        await ctx.db.insert("notifications", {
          userId: p.userId,
          type: "poll",
          title: `${me?.name || "Host"} started a poll`,
          body: poll.title,
          link: `/call/${code}`,
          read: false,
          createdAt: Date.now(),
        });
      }
    }
  },
});

/** Host closes the poll — no more votes, results available. */
export const closePoll = mutation({
  args: { code: v.string(), pollId: v.id("polls") },
  handler: async (ctx, { code, pollId }) => {
    await requireHost(ctx, code);
    const poll = await ctx.db.get(pollId);
    if (poll === null) throw new Error("Poll not found.");
    await ctx.db.patch(pollId, { closed: true, showResults: true });
  },
});

/** Host toggles whether live results are visible to participants. */
export const togglePollResults = mutation({
  args: { code: v.string(), pollId: v.id("polls"), show: v.boolean() },
  handler: async (ctx, { code, pollId, show }) => {
    await requireHost(ctx, code);
    const poll = await ctx.db.get(pollId);
    if (poll === null) throw new Error("Poll not found.");
    await ctx.db.patch(pollId, { showResults: show });
  },
});

/** Host deletes a poll and its votes. */
export const deletePoll = mutation({
  args: { code: v.string(), pollId: v.id("polls") },
  handler: async (ctx, { code, pollId }) => {
    await requireHost(ctx, code);
    const poll = await ctx.db.get(pollId);
    if (poll === null) throw new Error("Poll not found.");
    const votes = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", pollId))
      .collect();
    for (const vote of votes) await ctx.db.delete(vote._id);
    await ctx.db.delete(pollId);
  },
});

/**
 * Set (or clear) a participant's vote on an option.
 * - single: choosing a new option replaces the old vote; choosing the same
 *   option again un-votes.
 * - multiple: `vote: true` adds an option, `vote: false` removes it.
 * - anonymous: counts identically, but names are never stored.
 */
export const setPollVote = mutation({
  args: {
    code: v.string(),
    pollId: v.id("polls"),
    voter: v.string(),
    choice: v.number(),
    vote: v.boolean(),
  },
  handler: async (ctx, { code, pollId, voter, choice, vote }) => {
    const normalized = normalizeCode(code);
    const poll = await ctx.db.get(pollId);
    if (poll === null) throw new Error("Poll not found.");
    if (!poll.launched) throw new Error("This poll hasn't started yet.");
    if (poll.closed) throw new Error("This poll is closed.");
    if (choice < 0 || choice >= poll.options.length)
      throw new Error("That option doesn't exist.");
    if (voter === "") throw new Error("Join the meeting to vote.");

    const mine = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", pollId))
      .filter((q) => q.eq(q.field("voter"), voter))
      .collect();

    if (poll.type === "single") {
      // replace any existing vote with this one (or clear it)
      for (const existing of mine) await ctx.db.delete(existing._id);
      if (vote) {
        await ctx.db.insert("pollVotes", {
          pollId,
          code: normalized,
          voter,
          choice,
          createdAt: Date.now(),
        });
      }
      return;
    }

    // multiple-choice: toggle this one option
    const existing = mine.find((m) => m.choice === choice);
    if (vote && existing === undefined) {
      await ctx.db.insert("pollVotes", {
        pollId,
        code: normalized,
        voter,
        choice,
        createdAt: Date.now(),
      });
    } else if (!vote && existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/** Polls for a meeting with derived vote totals + the viewer's own choices. */
export const listPolls = query({
  args: { code: v.string(), viewer: v.optional(v.string()) },
  handler: async (ctx, { code, viewer }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    const polls = await ctx.db
      .query("polls")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("desc")
      .take(50);

    const out = [];
    for (const poll of polls) {
      const votes = await ctx.db
        .query("pollVotes")
        .withIndex("by_poll", (q) => q.eq("pollId", poll._id))
        .collect();
      const totals = poll.options.map((_, i) =>
        votes.reduce((acc, vote) => acc + (vote.choice === i ? 1 : 0), 0),
      );
      const myChoices = viewer
        ? votes.filter((vote) => vote.voter === viewer).map((vote) => vote.choice)
        : [];
      out.push({
        ...poll,
        totals,
        voterCount: votes.length > 0 ? new Set(votes.map((v) => v.voter)).size : 0,
        myChoices,
      });
    }
    return out;
  },
});
