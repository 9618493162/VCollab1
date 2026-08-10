"use node";

// Supabase integration — storage-backed meeting file sharing.
//
// Keys are read via process.env (set them in the project's Keys/API keys
// tab, never in the frontend): SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Only the service-role key is used, and only from this module — the browser
// uploads straight to short-lived signed URLs minted here.
import { v } from "convex/values";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { normalizeCode } from "./rooms";

const BUCKET = "meeting-files";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the project Keys tab.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Create the storage bucket on first use (idempotent). */
async function ensureBucket(client: SupabaseClient) {
  const { data } = await client.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await client.storage.createBucket(BUCKET, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new Error(`Supabase bucket setup failed: ${error.message}`);
  }
}

/** Whether the two keys are present (so the UI can show a setup notice). */
export const ping = action({
  args: {},
  handler: async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const missing: string[] = [];
    if (!url) missing.push("SUPABASE_URL");
    if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    return { configured: missing.length === 0, missing };
  },
});

/**
 * Mint a short-lived signed upload URL. The browser PUTs the file body
 * directly to `uploadUrl`, then calls supabaseData.recordUpload.
 */
export const createSignedUploadUrl = action({
  args: {
    code: v.string(),
    fileName: v.string(),
    size: v.number(),
    contentType: v.optional(v.string()),
    uploaderName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeCode(args.code);
    if (normalized === "") throw new Error("Invalid meeting code.");
    const room = await ctx.runQuery(api.rooms.getRoom, { code: normalized });
    if (room === null) throw new Error("Meeting not found.");

    const name = args.fileName
      .trim()
      .slice(0, 120)
      .replace(/[^\w.\-() ]/g, "_");
    if (name === "") throw new Error("Invalid file name.");
    if (args.size <= 0 || args.size > MAX_BYTES) {
      throw new Error("Files must be 25 MB or smaller.");
    }

    const client = getClient();
    await ensureBucket(client);

    const identity = await ctx.auth.getUserIdentity();
    const uploadedBy = identity?.subject ?? "anonymous";
    const uploaderName =
      args.uploaderName?.trim().slice(0, 60) ||
      identity?.name ||
      identity?.email ||
      "Participant";

    const path = `${normalized}/${crypto.randomUUID()}-${name}`;
    const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(`Couldn't create an upload link: ${error?.message ?? "unknown error"}`);
    }
    return { path, uploadUrl: data.signedUrl, uploadedBy, uploaderName };
  },
});

type FileWithUrl = {
  _id: string;
  code: string;
  name: string;
  path: string;
  size: number;
  contentType?: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: number;
  url: string | null;
};

/** Metadata + fresh short-lived download URLs for every shared file. */
export const listFilesWithUrls = action({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<FileWithUrl[]> => {
    const normalized = normalizeCode(code);
    if (normalized === "") return [];
    const client = getClient();
    const rows = await ctx.runQuery(api.supabaseData.listFiles, { code: normalized });
    return await Promise.all(
      rows.map(async (row) => {
        const { data, error } = await client.storage.from(BUCKET).createSignedUrl(row.path, 3600);
        return { ...row, url: error || !data ? null : data.signedUrl };
      }),
    );
  },
});

/** Delete a shared file: only the uploader or the meeting host may. */
export const deleteFile = action({
  args: { fileId: v.id("sharedFiles") },
  handler: async (ctx, { fileId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const subject = identity?.subject;
    if (!subject) throw new Error("Sign in to delete files.");

    const row = await ctx.runQuery(internal.supabaseData.getFile, { fileId });
    if (row === null) throw new Error("File not found.");

    const room = await ctx.runQuery(api.rooms.getRoom, { code: row.code });
    const isHost = room !== null && String(room.createdBy) === subject;
    if (row.uploadedBy !== subject && !isHost) {
      throw new Error("Only the uploader or the meeting host can delete this file.");
    }

    const client = getClient();
    const { error } = await client.storage.from(BUCKET).remove([row.path]);
    if (error) throw new Error(`Couldn't remove the file: ${error.message}`);

    await ctx.runMutation(internal.supabaseData.removeFile, { fileId });
  },
});
