import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeCode } from "./rooms";

/** Resolve the signed-in user as host of `code`, or throw. */
async function requireHost(ctx: MutationCtx | QueryCtx, code: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to manage Q&A");
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (room === null) throw new Error("Meeting not found.");
  if (room.createdBy !== userId) throw new Error("Only the host can do that.");
  return userId;
}

/** Anyone in the meeting can ask a question. */
export const askQuestion = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    authorName: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { code, clientId, authorName, text }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const clean = text.trim().slice(0, 500);
    if (clean === "") throw new Error("Write your question first.");
    await ctx.db.insert("qaQuestions", {
      code: normalized,
      clientId: clientId.slice(0, 80),
      authorName: authorName.trim().slice(0, 40) || "Someone",
      text: clean,
      upvoters: [],
      answered: false,
      pinned: false,
      createdAt: Date.now(),
    });
  },
});

/** Toggle the viewer's upvote on a question. */
export const toggleUpvote = mutation({
  args: { code: v.string(), questionId: v.id("qaQuestions"), clientId: v.string() },
  handler: async (ctx, { code, questionId, clientId }) => {
    const normalized = normalizeCode(code);
    const question = await ctx.db.get(questionId);
    if (question === null) throw new Error("Question not found.");
    if (question.code !== normalized) throw new Error("Question not found.");
    if (clientId === "") throw new Error("Join the meeting to upvote.");
    const upvoters = question.upvoters.includes(clientId)
      ? question.upvoters.filter((id) => id !== clientId)
      : [...question.upvoters, clientId];
    await ctx.db.patch(questionId, { upvoters });
  },
});

/** The asker can pull their own question down. Hosts can too. */
export const removeQuestion = mutation({
  args: { code: v.string(), questionId: v.id("qaQuestions"), clientId: v.string() },
  handler: async (ctx, { code, questionId, clientId }) => {
    const normalized = normalizeCode(code);
    const question = await ctx.db.get(questionId);
    if (question === null) throw new Error("Question not found.");
    if (question.code !== normalized) throw new Error("Question not found.");
    const userId = await getAuthUserId(ctx);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    const isHost = userId !== null && room !== null && room.createdBy === userId;
    const isAuthor = question.clientId === clientId;
    if (!isHost && !isAuthor)
      throw new Error("Only the author or the host can remove this question.");
    await ctx.db.delete(questionId);
  },
});

/** Host answers a question (empty answer toggles it back to unanswered). */
export const answerQuestion = mutation({
  args: { code: v.string(), questionId: v.id("qaQuestions"), answer: v.string() },
  handler: async (ctx, { code, questionId, answer }) => {
    await requireHost(ctx, code);
    const question = await ctx.db.get(questionId);
    if (question === null) throw new Error("Question not found.");
    const clean = answer.trim().slice(0, 800);
    if (clean === "") {
      await ctx.db.patch(questionId, { answered: false, answer: undefined });
    } else {
      await ctx.db.patch(questionId, { answered: true, answer: clean });
    }
  },
});

/** Host pins / unpins a question so it stays on top. */
export const togglePin = mutation({
  args: { code: v.string(), questionId: v.id("qaQuestions") },
  handler: async (ctx, { code, questionId }) => {
    await requireHost(ctx, code);
    const question = await ctx.db.get(questionId);
    if (question === null) throw new Error("Question not found.");
    await ctx.db.patch(questionId, { pinned: !question.pinned });
  },
});

/** Host deletes a question outright. */
export const deleteQuestion = mutation({
  args: { code: v.string(), questionId: v.id("qaQuestions") },
  handler: async (ctx, { code, questionId }) => {
    await requireHost(ctx, code);
    const question = await ctx.db.get(questionId);
    if (question === null) throw new Error("Question not found.");
    await ctx.db.delete(questionId);
  },
});

/** Questions for a meeting: pinned first, then by upvotes, then oldest. */
export const listQuestions = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    const rows = await ctx.db
      .query("qaQuestions")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .collect();
    return rows
      .map((q) => ({ ...q, upvotes: q.upvoters.length }))
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          b.upvotes - a.upvotes ||
          a.createdAt - b.createdAt,
      )
      .slice(0, 200);
  },
});
