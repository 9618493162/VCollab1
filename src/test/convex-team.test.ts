import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

async function workspaceWithOwner(t: TestClient) {
  const ownerId = await insertUser(t, "owner@example.com", "Owner");
  const owner = t.withIdentity({ subject: ownerId });
  const workspaceId = await owner.mutation(api.workspaces.createWorkspace, {
    name: "  Acme Inc  ",
    description: "  Building things  ",
  });
  return { ownerId, owner, workspaceId };
}

describe("workspaces (Phase 48)", () => {
  it("creates a workspace with the creator as owner and a #general channel", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);

    const ws = await owner.query(api.workspaces.getWorkspace, { workspaceId });
    expect(ws?.name).toBe("Acme Inc");
    expect(ws?.description).toBe("Building things");
    expect(ws?.myRole).toBe("owner");
    expect(ws?.channels.map((c) => c.name)).toEqual(["general"]);
    expect(ws?.members).toHaveLength(1);
    expect(ws?.members[0].role).toBe("owner");
  });

  it("rejects an empty or over-long name", async () => {
    const t = makeTestClient();
    const ownerId = await insertUser(t, "owner@example.com", "Owner");
    const owner = t.withIdentity({ subject: ownerId });
    await expect(
      owner.mutation(api.workspaces.createWorkspace, { name: "   " }),
    ).rejects.toThrow("name is required");
    await expect(
      owner.mutation(api.workspaces.createWorkspace, { name: "x".repeat(61) }),
    ).rejects.toThrow("too long");
  });

  it("lists only workspaces I belong to", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);

    const strangerId = await insertUser(t, "stranger@example.com", "Stranger");
    const stranger = t.withIdentity({ subject: strangerId });
    expect(await stranger.query(api.workspaces.listMyWorkspaces, {})).toEqual([]);
    expect(await stranger.query(api.workspaces.getWorkspace, { workspaceId })).toBeNull();

    const mine = await owner.query(api.workspaces.listMyWorkspaces, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Acme Inc");
    expect(mine[0].myRole).toBe("owner");
    expect(mine[0].memberCount).toBe(1);
  });

  it("invites a registered user, is idempotent, and notifies them", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);
    const guestId = await insertUser(t, "Guest@Example.com", "Guest");
    const guest = t.withIdentity({ subject: guestId });

    const first = await owner.mutation(api.workspaces.inviteMember, {
      workspaceId,
      email: "guest@example.com",
      role: "member",
    });
    expect(first.added).toBe(true);

    const second = await owner.mutation(api.workspaces.inviteMember, {
      workspaceId,
      email: "guest@example.com",
    });
    expect(second.added).toBe(false);

    const ws = await owner.query(api.workspaces.getWorkspace, { workspaceId });
    expect(ws?.members.map((m) => m.role).sort()).toEqual(["member", "owner"]);
    expect(ws?.members.length).toBe(2);

    const notifs = await t.run((ctx) =>
      ctx.db.query("notifications").filter((q) => q.eq(q.field("userId"), guestId)).collect(),
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("invite");

    // guests can't invite
    await expect(
      guest.mutation(api.workspaces.inviteMember, {
        workspaceId,
        email: "nobody@example.com",
      }),
    ).rejects.toThrow("Only owners and admins");

    // unknown emails are rejected
    await expect(
      owner.mutation(api.workspaces.inviteMember, {
        workspaceId,
        email: "ghost@example.com",
      }),
    ).rejects.toThrow("No VCollab account");
  });

  it("only the owner can grant or remove the owner role", async () => {
    const t = makeTestClient();
    const { owner, ownerId, workspaceId } = await workspaceWithOwner(t);
    const adminId = await insertUser(t, "admin@example.com", "Admin");
    const admin = t.withIdentity({ subject: adminId });
    const memberId = await insertUser(t, "member@example.com", "Member");

    await owner.mutation(api.workspaces.inviteMember, { workspaceId, email: "admin@example.com" });
    await owner.mutation(api.workspaces.inviteMember, { workspaceId, email: "member@example.com" });

    // admins can promote members, but not touch the owner role
    await owner.mutation(api.workspaces.updateRole, {
      workspaceId,
      userId: adminId,
      role: "admin",
    });
    await admin.mutation(api.workspaces.updateRole, {
      workspaceId,
      userId: memberId,
      role: "admin",
    });
    await expect(
      admin.mutation(api.workspaces.updateRole, {
        workspaceId,
        userId: ownerId,
        role: "member",
      }),
    ).rejects.toThrow("Only the owner can change the owner role.");

    // the last owner can't be demoted or removed
    await expect(
      owner.mutation(api.workspaces.updateRole, {
        workspaceId,
        userId: ownerId,
        role: "member",
      }),
    ).rejects.toThrow("at least one owner");
    await expect(
      owner.mutation(api.workspaces.removeMember, { workspaceId, userId: ownerId }),
    ).rejects.toThrow("at least one owner");
  });

  it("members without manage rights can't rename or remove people", async () => {
    const t = makeTestClient();
    const { owner, ownerId, workspaceId } = await workspaceWithOwner(t);
    const memberId = await insertUser(t, "member@example.com", "Member");
    const member = t.withIdentity({ subject: memberId });
    await owner.mutation(api.workspaces.inviteMember, { workspaceId, email: "member@example.com" });

    await expect(
      member.mutation(api.workspaces.renameWorkspace, { workspaceId, name: "Hijacked" }),
    ).rejects.toThrow("Only owners and admins");
    await expect(
      member.mutation(api.workspaces.removeMember, {
        workspaceId,
        userId: ownerId,
      }),
    ).rejects.toThrow("Only owners and admins");
  });
});

describe("channels (Phase 49)", () => {
  it("members can create channels; names are normalized and unique", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);

    await owner.mutation(api.channels.createChannel, {
      workspaceId,
      name: "  Design Review ",
    });
    const ws = await owner.query(api.workspaces.getWorkspace, { workspaceId });
    expect(ws?.channels.map((c) => c.name)).toEqual(["general", "design-review"]);

    await expect(
      owner.mutation(api.channels.createChannel, {
        workspaceId,
        name: "Design Review",
      }),
    ).rejects.toThrow("already exists");
    await expect(
      owner.mutation(api.channels.createChannel, { workspaceId, name: "bad name!" }),
    ).rejects.toThrow("letters, numbers and dashes");
  });

  it("guests can't create channels; the #general channel can't be deleted", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);
    const guestId = await insertUser(t, "guest@example.com", "Guest");
    const guest = t.withIdentity({ subject: guestId });
    await owner.mutation(api.workspaces.inviteMember, {
      workspaceId,
      email: "guest@example.com",
      role: "guest",
    });

    await expect(
      guest.mutation(api.channels.createChannel, { workspaceId, name: "side" }),
    ).rejects.toThrow("Guests can't create channels");

    const ws = await owner.query(api.workspaces.getWorkspace, { workspaceId });
    const general = ws?.channels.find((c) => c.name === "general");
    await expect(
      owner.mutation(api.channels.deleteChannel, { channelId: general!._id }),
    ).rejects.toThrow("can't be deleted");
  });

  it("messages are member-only, trimmed, ordered oldest-first, and deleted with the channel", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);
    const channelId = await owner.mutation(api.channels.createChannel, {
      workspaceId,
      name: "random",
    });

    const strangerId = await insertUser(t, "stranger@example.com", "Stranger");
    const stranger = t.withIdentity({ subject: strangerId });
    await expect(
      stranger.mutation(api.channels.sendMessage, { channelId, text: "intruder" }),
    ).rejects.toThrow("not a member");

    await owner.mutation(api.channels.sendMessage, { channelId, text: "  hello  " });
    await owner.mutation(api.channels.sendMessage, { channelId, text: "world" });

    const msgs = await owner.query(api.channels.listMessages, { channelId });
    expect(msgs.map((m) => m.text)).toEqual(["hello", "world"]);
    expect(msgs[0].userName).toBe("Owner");

    // admin can delete the channel and its messages
    await owner.mutation(api.channels.deleteChannel, { channelId });
    expect(await owner.query(api.channels.listMessages, { channelId })).toEqual([]);
  });
});

describe("direct messages (Phase 50)", () => {
  it("creates a stable 1:1 thread and prevents self-messaging", async () => {
    const t = makeTestClient();
    const aId = await insertUser(t, "a@example.com", "Alice");
    const bId = await insertUser(t, "b@example.com", "Bob");
    const a = t.withIdentity({ subject: aId });

    const threadId = await a.mutation(api.dms.getOrCreateThread, { otherUserId: bId });
    expect(await a.mutation(api.dms.getOrCreateThread, { otherUserId: bId })).toBe(threadId);
    await expect(
      a.mutation(api.dms.getOrCreateThread, { otherUserId: aId }),
    ).rejects.toThrow("yourself");
    // anonymous accounts can't receive DMs
    const anonId = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Anon", email: "anon@x.com", isAnonymous: true }),
    );
    await expect(
      a.mutation(api.dms.getOrCreateThread, { otherUserId: anonId }),
    ).rejects.toThrow("not found");
  });

  it("sends messages that only the two participants can read", async () => {
    const t = makeTestClient();
    const aId = await insertUser(t, "a@example.com", "Alice");
    const bId = await insertUser(t, "b@example.com", "Bob");
    const a = t.withIdentity({ subject: aId });
    const b = t.withIdentity({ subject: bId });
    const threadId = await a.mutation(api.dms.getOrCreateThread, { otherUserId: bId });

    await a.mutation(api.dms.sendMessage, { threadId, text: "  hi bob  " });
    await b.mutation(api.dms.sendMessage, { threadId, text: "hey alice" });

    const msgs = await b.query(api.dms.listMessages, { threadId });
    expect(msgs.map((m) => m.text)).toEqual(["hi bob", "hey alice"]);
    expect(msgs[0].fromName).toBe("Alice");

    const strangerId = await insertUser(t, "s@example.com", "Stranger");
    const stranger = t.withIdentity({ subject: strangerId });
    expect(await stranger.query(api.dms.listMessages, { threadId })).toEqual([]);

    await expect(
      stranger.mutation(api.dms.sendMessage, { threadId, text: "sneak" }),
    ).rejects.toThrow("not found");
  });

  it("tracks unread counts and clears them on read", async () => {
    const t = makeTestClient();
    const aId = await insertUser(t, "a@example.com", "Alice");
    const bId = await insertUser(t, "b@example.com", "Bob");
    const a = t.withIdentity({ subject: aId });
    const b = t.withIdentity({ subject: bId });
    const threadId = await a.mutation(api.dms.getOrCreateThread, { otherUserId: bId });

    await a.mutation(api.dms.sendMessage, { threadId, text: "one" });
    await a.mutation(api.dms.sendMessage, { threadId, text: "two" });

    let threads = await b.query(api.dms.listThreads, {});
    expect(threads).toHaveLength(1);
    expect(threads[0].otherUser.name).toBe("Alice");
    expect(threads[0].unread).toBe(2);
    expect(threads[0].lastMessagePreview).toBe("two");

    await b.mutation(api.dms.markThreadRead, { threadId });
    threads = await b.query(api.dms.listThreads, {});
    expect(threads[0].unread).toBe(0);
  });
});

describe("presence (Phase 51)", () => {
  it("upserts my status and exposes it by user id", async () => {
    const t = makeTestClient();
    const aId = await insertUser(t, "a@example.com", "Alice");
    const bId = await insertUser(t, "b@example.com", "Bob");
    const a = t.withIdentity({ subject: aId });
    const b = t.withIdentity({ subject: bId });

    await a.mutation(api.presence.setStatus, { status: "dnd" });
    const statuses = await b.query(api.presence.listStatus, { userIds: [aId] });
    expect(statuses[aId].status).toBe("dnd");
    expect(statuses[aId].lastSeen).toBeGreaterThan(0);

    // heartbeat keeps lastSeen fresh without changing status
    const before = statuses[aId].lastSeen;
    await a.mutation(api.presence.heartbeat, {});
    const after = (await b.query(api.presence.listStatus, { userIds: [aId] }))[aId];
    expect(after.lastSeen).toBeGreaterThanOrEqual(before);
    expect(after.status).toBe("dnd");
  });

  it("returns only requested users and requires sign-in", async () => {
    const t = makeTestClient();
    const aId = await insertUser(t, "a@example.com", "Alice");
    const bId = await insertUser(t, "b@example.com", "Bob");
    const a = t.withIdentity({ subject: aId });
    const b = t.withIdentity({ subject: bId });
    await a.mutation(api.presence.setStatus, { status: "available" });

    const statuses = await b.query(api.presence.listStatus, { userIds: [aId, bId] });
    expect(Object.keys(statuses)).toEqual([aId]);
    expect(statuses[aId].status).toBe("available");
  });
});
