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

const inTwoHours = Date.now() + 2 * 60 * 60_000;

describe("workspace meetings (Phase 60)", () => {
  it("only workspace members can schedule, and guests can't", async () => {
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
      guest.mutation(api.workspaceMeetings.scheduleWorkspaceMeeting, {
        workspaceId,
        title: "Guest sync",
        startTime: inTwoHours,
        durationMinutes: 30,
      }),
    ).rejects.toThrow("Guests can't schedule");

    const strangerId = await insertUser(t, "stranger@example.com", "Stranger");
    const stranger = t.withIdentity({ subject: strangerId });
    await expect(
      stranger.mutation(api.workspaceMeetings.scheduleWorkspaceMeeting, {
        workspaceId,
        title: "Hijack",
        startTime: inTwoHours,
        durationMinutes: 30,
      }),
    ).rejects.toThrow("not a member");
  });

  it("schedules a real meeting, announces in #general, and notifies the team", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);
    const memberId = await insertUser(t, "member@example.com", "Member");
    await owner.mutation(api.workspaces.inviteMember, { workspaceId, email: "member@example.com" });

    const code = await owner.mutation(api.workspaceMeetings.scheduleWorkspaceMeeting, {
      workspaceId,
      title: "  Product review  ",
      startTime: inTwoHours,
      durationMinutes: 45,
    });
    expect(code.length).toBeGreaterThan(0);

    // listed for members with the workspace link + host name
    const list = await owner.query(api.workspaceMeetings.listWorkspaceMeetings, { workspaceId });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Product review");
    expect(list[0].startTime).toBe(inTwoHours);
    expect(list[0].durationMinutes).toBe(45);
    expect(list[0].hostName).toBe("Owner");
    expect(list[0].isMine).toBe(true);
    expect(list[0].recurring).toBe(false);

    // announcement landed in #general
    const general = (
      await owner.query(api.workspaces.getWorkspace, { workspaceId })
    )?.channels.find((c) => c.name === "general");
    const announcements = await t.run((ctx) =>
      ctx.db
        .query("channelMessages")
        .withIndex("by_channel", (q) => q.eq("channelId", general!._id))
        .collect(),
    );
    expect(announcements).toHaveLength(1);
    expect(announcements[0].text).toContain("Product review");

    // the other member got a notification with the join link
    const notifs = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("userId"), memberId))
        .collect(),
    );
    const meetingNotif = notifs.find((n) => n.type === "meeting");
    expect(meetingNotif).toBeDefined();
    expect(meetingNotif!.link).toContain(code);

    // strangers can't see the workspace's meetings
    const strangerId = await insertUser(t, "stranger@example.com", "Stranger");
    const stranger = t.withIdentity({ subject: strangerId });
    expect(await stranger.query(api.workspaceMeetings.listWorkspaceMeetings, { workspaceId })).toEqual([]);
  });

  it("materializes recurring occurrences as a shared series", async () => {
    const t = makeTestClient();
    const { owner, workspaceId } = await workspaceWithOwner(t);

    await owner.mutation(api.workspaceMeetings.scheduleWorkspaceMeeting, {
      workspaceId,
      title: "Standup",
      startTime: inTwoHours,
      durationMinutes: 15,
      recurrence: { frequency: "daily", interval: 1, endType: "after", endAfter: 3 },
    });

    const list = await owner.query(api.workspaceMeetings.listWorkspaceMeetings, { workspaceId });
    expect(list).toHaveLength(3);
    expect(list.every((m) => m.recurring)).toBe(true);
    expect(list[0].title).toBe("Standup");
  });
});
