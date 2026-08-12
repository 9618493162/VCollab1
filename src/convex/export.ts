import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/**
 * Everything this user is allowed to export: profile, meetings they created
 * (plus the related notes, tasks, files, chat, AI artifacts, polls, Q&A and
 * agenda), scheduled meetings they host or were invited to, and their own
 * notifications. Returns plain JSON for a client-side download.
 */
export const exportUserData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to export your data");

    const profile = await ctx.db.get(userId);
    if (profile === null) throw new Error("Account not found.");

    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .order("desc")
      .take(200);
    const codes = rooms.map((r) => r.code);

    const scheduled = await ctx.db
      .query("scheduledMeetings")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .collect();
    for (const m of scheduled) if (!codes.includes(m.code)) codes.push(m.code);

    const user = await ctx.db.get(userId);
    const myEmail = user?.email?.toLowerCase();
    if (myEmail) {
      const invited = await ctx.db.query("scheduledMeetings").collect();
      for (const m of invited) {
        if ((m.attendees ?? []).includes(myEmail) && !codes.includes(m.code)) {
          codes.push(m.code);
        }
      }
    }

    const notes = [];
    const kanban = [];
    const aiData = [];
    const recordings = [];
    const sharedFiles = [];
    const messages = [];
    const polls = [];
    const qa = [];
    const agenda = [];
    for (const code of codes) {
      for (const n of await ctx.db
        .query("notes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        notes.push(n);
      for (const k of await ctx.db
        .query("kanbanCards")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        kanban.push(k);
      for (const a of await ctx.db
        .query("aiData")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        aiData.push(a);
      for (const r of await ctx.db
        .query("recordings")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        recordings.push(r);
      for (const f of await ctx.db
        .query("sharedFiles")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        sharedFiles.push(f);
      for (const m of await ctx.db
        .query("messages")
        .withIndex("by_code", (q) => q.eq("code", code))
        .order("asc")
        .take(500))
        messages.push(m);
      for (const p of await ctx.db
        .query("polls")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        polls.push(p);
      for (const q of await ctx.db
        .query("qaQuestions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        qa.push(q);
      for (const a of await ctx.db
        .query("agendaItems")
        .withIndex("by_code", (q) => q.eq("code", code))
        .collect())
        agenda.push(a);
    }

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);

    return {
      exportedAt: new Date().toISOString(),
      app: "VCollab",
      profile: {
        name: profile.name,
        email: profile.email,
        role: profile.role,
      },
      meetings: rooms,
      scheduledMeetings: scheduled,
      notes,
      tasks: kanban,
      aiArtifacts: aiData,
      recordings,
      files: sharedFiles,
      chat: messages,
      polls,
      qaQuestions: qa,
      agenda,
      notifications,
    };
  },
});
