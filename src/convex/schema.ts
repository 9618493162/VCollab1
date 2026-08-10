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
      status: v.union(
        v.literal("scheduled"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("cancelled"),
      ),
      createdAt: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_host", ["hostId"]),

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

    // AI artifacts: transcripts, summaries, action items
    aiData: defineTable({
      code: v.string(),
      kind: v.union(
        v.literal("transcript"),
        v.literal("summary"),
        v.literal("actionItems"),
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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
