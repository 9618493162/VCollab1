import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { normalizeCode } from "./rooms";

/** Metadata rows for a meeting's shared files, newest first (reactive). */
export const listFiles = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    return await ctx.db
      .query("sharedFiles")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("desc")
      .take(100);
  },
});

/** Called by the frontend after the browser PUTs the file to the signed URL. */
export const recordUpload = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    path: v.string(),
    size: v.number(),
    contentType: v.optional(v.string()),
    uploadedBy: v.string(),
    uploadedByName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to share files");
    const normalized = normalizeCode(args.code);
    if (normalized === "" || !args.path) throw new Error("Invalid file.");
    await ctx.db.insert("sharedFiles", {
      code: normalized,
      name: args.name.trim().slice(0, 120),
      path: args.path,
      size: args.size,
      contentType: args.contentType || undefined,
      uploadedBy: args.uploadedBy,
      uploadedByName: args.uploadedByName || "Participant",
      createdAt: Date.now(),
    });
  },
});

/** Fetch one row so the delete action can check ownership before removing the blob. */
export const getFile = internalQuery({
  args: { fileId: v.id("sharedFiles") },
  handler: async (ctx, { fileId }) => {
    return await ctx.db.get(fileId);
  },
});

/** Remove the metadata row after the blob has been deleted from Supabase. */
export const removeFile = internalMutation({
  args: { fileId: v.id("sharedFiles") },
  handler: async (ctx, { fileId }) => {
    const row = await ctx.db.get(fileId);
    if (row === null) return;
    await ctx.db.delete(fileId);
  },
});
