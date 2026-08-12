import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";

async function workspaceWithOwner(t: TestClient) {
  const ownerId = await insertUser(t, "owner@example.com", "Owner");
  const owner = t.withIdentity({ subject: ownerId });
  const workspaceId = await owner.mutation(api.workspaces.createWorkspace, {
    name: "Acme Inc",
  });
  return { ownerId, owner, workspaceId };
}

describe("onboarding (Phase 57)", () => {
  it("flags new users and completes the wizard", async () => {
    const t = makeTestClient();
    const userId = await insertUser(t, "a@example.com", "Alice");
    const a = t.withIdentity({ subject: userId });

    expect(await a.query(api.onboarding.needsOnboarding, {})).toBe(true);
    await a.mutation(api.onboarding.completeOnboarding, {});
    expect(await a.query(api.onboarding.needsOnboarding, {})).toBe(false);
  });
});

describe("support tickets (Phase 58)", () => {
  it("validates and stores support requests per user", async () => {
    const t = makeTestClient();
    const aId = await insertUser(t, "a@example.com", "Alice");
    const bId = await insertUser(t, "b@example.com", "Bob");
    const a = t.withIdentity({ subject: aId });
    const b = t.withIdentity({ subject: bId });

    await expect(
      a.mutation(api.support.submitTicket, { subject: "hi", message: "short" }),
    ).rejects.toThrow("subject");
    await expect(
      a.mutation(api.support.submitTicket, { subject: "  Can't share my screen  ", message: "too short" }),
    ).rejects.toThrow("more");

    await a.mutation(api.support.submitTicket, {
      subject: "  Can't share my screen  ",
      message: "Screen share stays black for everyone in the call.",
    });
    await b.mutation(api.support.submitTicket, {
      subject: "Invite emails missing",
      message: "Invitees never received the email with the meeting link.",
    });

    const mine = await a.query(api.support.listMyTickets, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe("Can't share my screen");
    expect(mine[0].status).toBe("open");
    expect(mine[0].message.length).toBeGreaterThan(10);
  });
});

describe("org admin (Phase 59)", () => {
  it("restricts the overview to owners and admins", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);
    const memberId = await insertUser(t, "member@example.com", "Member");
    const member = t.withIdentity({ subject: memberId });
    await owner.mutation(api.workspaces.inviteMember, { workspaceId, email: "member@example.com" });

    await expect(
      member.query(api.admin.getOrgOverview, { workspaceId }),
    ).rejects.toThrow("Only owners and admins");

    const overview = await owner.query(api.admin.getOrgOverview, { workspaceId });
    expect(overview?.myRole).toBe("owner");
    expect(overview?.stats.members).toBe(2);
    expect(overview?.stats.channels).toBe(1); // #general
  });

  it("reports real channel activity and message counts", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);
    const general = (
      await owner.query(api.workspaces.getWorkspace, { workspaceId })
    )?.channels.find((c) => c.name === "general");

    await owner.mutation(api.channels.sendMessage, { channelId: general!._id, text: "first" });
    await owner.mutation(api.channels.sendMessage, { channelId: general!._id, text: "second" });

    const overview = await owner.query(api.admin.getOrgOverview, { workspaceId });
    expect(overview?.stats.messages).toBe(2);
    expect(overview?.activity.map((a) => a.text).sort()).toEqual(["first", "second"]);
    expect(overview?.activity.every((a) => a.channel === "general" && a.author === "Owner")).toBe(true);
  });

  it("only the owner can transfer ownership", async () => {
    const t = makeTestClient();
    const { owner, ownerId, workspaceId } = await workspaceWithOwner(t);
    const adminId = await insertUser(t, "admin@example.com", "Admin");
    const admin = t.withIdentity({ subject: adminId });
    const memberId = await insertUser(t, "member@example.com", "Member");
    await owner.mutation(api.workspaces.inviteMember, { workspaceId, email: "admin@example.com" });
    await owner.mutation(api.workspaces.inviteMember, { workspaceId, email: "member@example.com" });

    // an admin can't transfer ownership
    await owner.mutation(api.workspaces.updateRole, {
      workspaceId,
      userId: adminId,
      role: "admin",
    });
    await expect(
      admin.mutation(api.admin.transferOwnership, { workspaceId, newOwnerId: memberId }),
    ).rejects.toThrow("Only the owner");

    // the owner can, and becomes an admin themselves
    await owner.mutation(api.admin.transferOwnership, { workspaceId, newOwnerId: adminId });
    const ws = await owner.query(api.workspaces.getWorkspace, { workspaceId });
    const roles = Object.fromEntries(ws!.members.map((m) => [m.role, m.userId]));
    expect(roles.owner).toBe(adminId);
    expect(roles.admin).toBe(ownerId);
  });
});
