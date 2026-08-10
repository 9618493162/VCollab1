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
    }).index("by_code", ["code"]).index("by_createdBy", ["createdBy"]),

    // who is currently in a room (mesh call presence)
    presence: defineTable({
      code: v.string(),
      clientId: v.string(), // per-tab random id
      name: v.string(),
      joinedAt: v.number(),
      lastSeen: v.number(), // heartbeat, used to expire stale rows
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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
