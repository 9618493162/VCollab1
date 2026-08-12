import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      onboardedAt: v.optional(v.number()), // first-run wizard completion time (Phase 57)
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // a video meeting room, keyed by a human-shareable code
    rooms: defineTable({
      code: v.string(), // e.g. "abc-defg-hij"
      createdBy: v.id("users"),
      createdAt: v.number(),
      title: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("scheduled"),
          v.literal("active"),
          v.literal("ended"),
        ),
      ),
      startedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      locked: v.optional(v.boolean()),
    }).index("by_code", ["code"]).index("by_createdBy", ["createdBy"]),

    // who is currently in a room (mesh call presence)
    presence: defineTable({
      code: v.string(),
      clientId: v.string(), // per-tab random id
      name: v.string(),
      joinedAt: v.number(),
      lastSeen: v.number(), // heartbeat, used to expire stale rows
      sharing: v.optional(v.boolean()), // currently screen-sharing
      handRaised: v.optional(v.boolean()),
    }).index("by_code", ["code"]),

    // WebRTC signaling relay: offers, answers, ICE candidates, hello/bye
    signals: defineTable({
      code: v.string(),
      from: v.string(),
      to: v.string(), // a clientId or "*" for broadcast
      kind: v.string(),
      payload: v.optional(v.string()), // JSON-encoded sdp / candidate
      createdAt: v.number(),
    }).index("by_code_to", ["code", "to"]),

    // in-call chat messages
    messages: defineTable({
      code: v.string(),
      from: v.string(), // clientId
      name: v.string(),
      text: v.string(),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // quick emoji reactions fired during a call (pruned after ~30s)
    reactions: defineTable({
      code: v.string(),
      emoji: v.string(),
      name: v.string(),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // meetings scheduled ahead of time (rooms row holds the joinable code)
    scheduledMeetings: defineTable({
      code: v.string(),
      hostId: v.id("users"),
      title: v.string(),
      description: v.optional(v.string()),
      startTime: v.number(), // epoch ms
      durationMinutes: v.number(),
      attendees: v.optional(v.array(v.string())), // invitee emails
      rsvps: v.optional(
        v.array(
          v.object({
            email: v.string(), // normalized invitee email
            status: v.union(
              v.literal("yes"),
              v.literal("no"),
              v.literal("maybe"),
            ),
            respondedAt: v.number(),
          }),
        ),
      ), // per-invitee response, keyed by email
      status: v.union(
        v.literal("scheduled"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("cancelled"),
      ),
      // recurrence for repeating meetings (Phase 47). Occurrences are
      // materialized as sibling scheduledMeetings rows sharing a seriesId.
      recurrence: v.optional(
        v.object({
          frequency: v.union(
            v.literal("daily"),
            v.literal("weekly"),
            v.literal("monthly"),
          ),
          interval: v.number(), // every N days / weeks / months
          daysOfWeek: v.optional(v.array(v.number())), // 0-6 (Sun-Sat), weekly only
          endType: v.union(v.literal("never"), v.literal("after"), v.literal("on")),
          endAfter: v.optional(v.number()), // number of occurrences
          endDate: v.optional(v.number()), // epoch ms
          seriesId: v.string(),
        }),
      ),
      createdAt: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_host", ["hostId"])
      .index("by_series", ["recurrence.seriesId"]),

    // shared meeting notes (one doc per meeting)
    notes: defineTable({
      code: v.string(),
      title: v.string(),
      content: v.string(),
      updatedAt: v.number(),
      updatedBy: v.optional(v.id("users")),
      updatedByName: v.optional(v.string()),
    }).index("by_code", ["code"]),

    // collaboration Kanban cards per meeting
    kanbanCards: defineTable({
      code: v.string(),
      column: v.string(), // todo | inProgress | review | done
      title: v.string(),
      description: v.optional(v.string()),
      assignee: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      priority: v.optional(v.string()), // low | medium | high
      labels: v.array(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_code", ["code"]),

    // per-user notification center
    notifications: defineTable({
      userId: v.id("users"),
      type: v.string(),
      title: v.string(),
      body: v.optional(v.string()),
      link: v.optional(v.string()),
      read: v.boolean(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // per-user account settings (notifications, language, meeting defaults)
    userSettings: defineTable({
      userId: v.id("users"),
      notifyReminders: v.boolean(),
      notifyInvites: v.boolean(),
      notifySummaries: v.boolean(),
      notifyCollaboration: v.boolean(),
      language: v.optional(v.string()),
      timezone: v.optional(v.string()),
      joinWithMic: v.boolean(),
      joinWithCam: v.boolean(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // AI artifacts: transcripts, summaries, action items
    aiData: defineTable({
      code: v.string(),
      kind: v.union(
        v.literal("transcript"),
        v.literal("summary"),
        v.literal("actionItems"),
        v.literal("minutes"),
      ),
      content: v.optional(v.string()),
      items: v.optional(v.array(v.string())),
      model: v.optional(v.string()),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // meeting recordings
    recordings: defineTable({
      code: v.string(),
      storageId: v.id("_storage"),
      url: v.string(),
      createdBy: v.id("users"),
      createdAt: v.number(),
      durationMs: v.optional(v.number()),
    }).index("by_code", ["code"]),

    // meeting files shared via Supabase Storage (metadata lives here, blobs in Supabase)
    sharedFiles: defineTable({
      code: v.string(),
      name: v.string(), // display name
      path: v.string(), // Supabase storage path
      size: v.number(),
      contentType: v.optional(v.string()),
      uploadedBy: v.string(), // auth subject
      uploadedByName: v.string(),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // live meeting polls (Phase 30). Votes live in `pollVotes`.
    polls: defineTable({
      code: v.string(),
      title: v.string(),
      type: v.union(
        v.literal("single"),
        v.literal("multiple"),
        v.literal("anonymous"),
      ),
      options: v.array(v.string()),
      createdBy: v.id("users"),
      createdByName: v.optional(v.string()),
      createdAt: v.number(),
      launched: v.boolean(),
      closed: v.boolean(),
      showResults: v.boolean(),
    }).index("by_code", ["code"]),

    // one row per (poll, voter, choice) — counts are derived from these
    pollVotes: defineTable({
      pollId: v.id("polls"),
      code: v.string(),
      voter: v.string(), // clientId (anonymous polls still dedupe votes)
      name: v.optional(v.string()), // omitted for anonymous polls
      choice: v.number(), // index into poll.options
      createdAt: v.number(),
    }).index("by_poll", ["pollId"]),

    // Q&A questions for a meeting (Phase 31)
    qaQuestions: defineTable({
      code: v.string(),
      clientId: v.string(), // asker's call client id
      authorName: v.string(),
      text: v.string(),
      upvoters: v.array(v.string()), // clientIds that upvoted
      answered: v.boolean(),
      answer: v.optional(v.string()),
      pinned: v.boolean(),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // meeting agenda items (Phase 38)
    agendaItems: defineTable({
      code: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      durationMinutes: v.optional(v.number()),
      presenter: v.optional(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("done"),
      ),
      position: v.number(),
      createdBy: v.id("users"),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // --- Team collaboration (Phases 48-53) ---

    // team workspaces: containers for members, channels, meetings, notes, tasks
    workspaces: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      createdBy: v.id("users"),
      createdAt: v.number(),
    }).index("by_createdBy", ["createdBy"]),

    // membership + roles (owner > admin > member > guest)
    workspaceMembers: defineTable({
      workspaceId: v.id("workspaces"),
      userId: v.id("users"),
      role: v.union(
        v.literal("owner"),
        v.literal("admin"),
        v.literal("member"),
        v.literal("guest"),
      ),
      joinedAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_user", ["userId"]),

    // channels inside a workspace (e.g. #general, #engineering)
    channels: defineTable({
      workspaceId: v.id("workspaces"),
      name: v.string(),
      createdBy: v.id("users"),
      createdAt: v.number(),
    }).index("by_workspace", ["workspaceId"]),

    // messages inside a channel
    channelMessages: defineTable({
      channelId: v.id("channels"),
      userId: v.id("users"),
      userName: v.string(),
      text: v.string(),
      createdAt: v.number(),
    }).index("by_channel", ["channelId"]),

    // 1:1 direct message threads (key = sorted user id pair)
    dmThreads: defineTable({
      key: v.string(),
      userIds: v.array(v.id("users")),
      createdAt: v.number(),
      lastMessageAt: v.number(),
      lastMessagePreview: v.optional(v.string()),
      lastMessageFrom: v.optional(v.id("users")),
    })
      .index("by_key", ["key"])
      .index("by_lastMessageAt", ["lastMessageAt"]),

    // messages inside a DM thread; readBy tracks who has seen them
    dmMessages: defineTable({
      threadId: v.id("dmThreads"),
      fromId: v.id("users"),
      fromName: v.string(),
      text: v.string(),
      createdAt: v.number(),
      readBy: v.array(v.id("users")),
    }).index("by_thread", ["threadId"]),

    // --- In-call breakout rooms (Phase 55) ---

    // one breakout session per meeting; the host starts/ends it and sets a timer
    breakoutSessions: defineTable({
      code: v.string(),
      status: v.union(v.literal("active"), v.literal("ended")),
      timerEndsAt: v.optional(v.number()),
      createdBy: v.id("users"),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // rooms inside a breakout session (e.g. "Room 1", "Design")
    breakoutRooms: defineTable({
      code: v.string(),
      name: v.string(),
      createdBy: v.id("users"),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // who is assigned to which breakout room, keyed by call clientId
    breakoutMembers: defineTable({
      code: v.string(),
      roomId: v.id("breakoutRooms"),
      clientId: v.string(),
      name: v.string(),
      joinedAt: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_room", ["roomId"]),

    // --- Help center (Phase 58) ---

    // support requests submitted from the help center
    supportTickets: defineTable({
      userId: v.id("users"),
      subject: v.string(),
      message: v.string(),
      status: v.union(v.literal("open"), v.literal("resolved")),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // --- Shared in-call whiteboard (Phase 56) ---

    // one stroke per row, rendered live for everyone in the meeting
    whiteboardStrokes: defineTable({
      code: v.string(),
      clientId: v.string(), // author's call client id
      name: v.string(),
      color: v.string(), // hex color
      width: v.number(), // stroke width in screen px
      highlighter: v.boolean(), // translucent mode
      points: v.array(
        v.object({
          x: v.number(), // 0..1000 logical space
          y: v.number(), // 0..600 logical space
        }),
      ),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    // messages inside a breakout room (host can broadcast to any room)
    breakoutMessages: defineTable({
      roomId: v.id("breakoutRooms"),
      from: v.string(), // clientId
      name: v.string(),
      text: v.string(),
      createdAt: v.number(),
    }).index("by_room", ["roomId"]),

    // user status presence (distinct from in-call `presence`)
    userPresence: defineTable({
      userId: v.id("users"),
      status: v.union(
        v.literal("available"),
        v.literal("away"),
        v.literal("dnd"),
        v.literal("offline"),
      ),
      lastSeen: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
