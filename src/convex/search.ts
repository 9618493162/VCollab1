import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

type Hit = { code: string; title: string; snippet?: string; match?: string };

type SearchResults = {
  meetings: Hit[];
  notes: Hit[];
  tasks: Hit[];
  chat: Hit[];
  transcripts: Hit[];
  files: Hit[];
};

const emptyResults = (): SearchResults => ({
  meetings: [],
  notes: [],
  tasks: [],
  chat: [],
  transcripts: [],
  files: [],
});

const MAX = 12;

function includes(haystack: string | undefined, needle: string) {
  return haystack !== undefined && haystack.toLowerCase().includes(needle);
}

/**
 * Search the signed-in user's workspace: meetings + scheduled meetings, shared
 * notes, kanban cards, AI transcripts/summaries, in-call chat, and shared
 * files. Convex has no built-in full-text index, so this does capped substring
 * matching over the user's own content. Results are grouped by kind for the UI.
 */
export const searchAll = query({
  args: { q: v.string() },
  handler: async (ctx, { q }): Promise<SearchResults> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return emptyResults();
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return emptyResults();

    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .take(200);
    const ownedCodes = new Set(rooms.map((r) => r.code));

    const meetings: Hit[] = [];
    const notes: Hit[] = [];
    const tasks: Hit[] = [];
    const chat: Hit[] = [];
    const transcripts: Hit[] = [];
    const files: Hit[] = [];

    for (const r of rooms) {
      if (meetings.length >= MAX) break;
      const title = r.title ?? r.code;
      if (includes(title, needle) || includes(r.code, needle)) {
        meetings.push({ code: r.code, title, match: title });
      }
    }

    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .take(100);
    for (const m of scheduled) {
      if (meetings.length >= MAX * 2) break;
      if (includes(m.title, needle) || includes(m.description, needle)) {
        meetings.push({ code: m.code, title: m.title, snippet: m.description, match: m.title });
      }
    }

    for (const n of await ctx.db.query("notes").collect()) {
      if (!ownedCodes.has(n.code)) continue;
      if (notes.length >= MAX) break;
      if (includes(n.title, needle) || includes(n.content, needle)) {
        notes.push({ code: n.code, title: n.title, snippet: n.content.slice(0, 160), match: n.title });
      }
    }

    for (const c of await ctx.db.query("kanbanCards").collect()) {
      if (!ownedCodes.has(c.code)) continue;
      if (tasks.length >= MAX) break;
      if (
        includes(c.title, needle) ||
        includes(c.description, needle) ||
        includes(c.assignee, needle)
      ) {
        tasks.push({ code: c.code, title: c.title, snippet: c.description, match: c.title });
      }
    }

    for (const a of await ctx.db.query("aiData").collect()) {
      if (!ownedCodes.has(a.code)) continue;
      if (transcripts.length >= MAX) break;
      const content = a.content ?? "";
      if (content.toLowerCase().includes(needle)) {
        transcripts.push({
          code: a.code,
          title: `Meeting ${a.code} · ${a.kind}`,
          snippet: content.slice(0, 160),
          match: content.slice(0, 80),
        });
      }
    }

    for (const msg of await ctx.db.query("messages").collect()) {
      if (!ownedCodes.has(msg.code)) continue;
      if (chat.length >= MAX) break;
      if (includes(msg.text, needle)) {
        chat.push({
          code: msg.code,
          title: msg.name,
          snippet: msg.text.slice(0, 200),
          match: msg.text.slice(0, 80),
        });
      }
    }

    for (const f of await ctx.db.query("sharedFiles").collect()) {
      if (!ownedCodes.has(f.code)) continue;
      if (files.length >= MAX) break;
      if (includes(f.name, needle)) {
        files.push({
          code: f.code,
          title: f.name,
          snippet: `Uploaded by ${f.uploadedByName}`,
          match: f.name,
        });
      }
    }

    return { meetings, notes, tasks, chat, transcripts, files };
  },
});
