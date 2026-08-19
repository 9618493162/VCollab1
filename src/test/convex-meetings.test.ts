import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { normalizeEmails } from "../convex/meetings";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("normalizeEmails", () => {
  it("trims, lowercases, dedupes, and drops invalid entries", () => {
    expect(
      normalizeEmails([
        "  Alice@Example.COM ",
        "bob@x.io",
        "alice@example.com",
        "not-an-email",
        "@missing",
        "bob@x.io",
      ]),
    ).toEqual(["alice@example.com", "bob@x.io"]);
  });

  it("caps the list at 20 entries", () => {
    const many = Array.from({ length: 30 }, (_, i) => `u${i}@example.com`);
    expect(normalizeEmails(many)).toHaveLength(20);
  });
});

describe("scheduled meetings", () => {
  it("requires auth to schedule", async () => {
    const t = makeTestClient();
    await expect(
      t.mutation(api.meetings.scheduleMeeting, {
        title: "Standup",
        startTime: Date.now() + 60 * 60_000,
        durationMinutes: 30,
      }),
    ).rejects.toThrow("Sign in to schedule a meeting");
  });

  it("creates a live room, stores normalized attendees, and invites registered users", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const inviteeId = await insertUser(t, "invitee@example.com", "Invitee");

    const host = t.withIdentity({ subject: hostId });
    const invitee = t.withIdentity({ subject: inviteeId });

    const code = await host.mutation(api.meetings.scheduleMeeting, {
      title: "  Sprint planning  ",
      startTime: Date.now() + 60 * 60_000,
      durationMinutes: 25,
      attendees: ["INVITEE@example.com", "invitee@example.com", "missing@example.com"],
    });
    expect(code).toMatch(/^VC-[A-HJKMNP-Z2-9]{6}$/);

    // The room exists immediately, marked as scheduled.
    const room = await t.query(api.rooms.getRoom, { code });
    expect(room?.title).toBe("Sprint planning");
    expect(room?.status).toBe("scheduled");

    // Attendee list is normalized; unregistered emails are kept but skipped for invites.
    const upcoming = await host.query(api.meetings.listUpcoming);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].attendees).toEqual([
      "invitee@example.com",
      "missing@example.com",
    ]);

    // The registered invitee got an in-app invitation notification.
    const notifications = await invitee.query(api.notifications.listNotifications);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("invite");
    expect(notifications[0].title).toContain("Sprint planning");
    expect(notifications[0].link).toBe(`/call/${code}`);

    // Only the host can cancel.
    await expect(
      invitee.mutation(api.meetings.cancelScheduled, { code }),
    ).rejects.toThrow("Only the host can cancel this meeting.");
    await host.mutation(api.meetings.cancelScheduled, { code });
    expect(await host.query(api.meetings.listUpcoming)).toHaveLength(0);
  });

  it("lets invited attendees see the meeting and notifies them when it's cancelled", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const inviteeId = await insertUser(t, "invitee@example.com", "Invitee");

    const host = t.withIdentity({ subject: hostId });
    const invitee = t.withIdentity({ subject: inviteeId });

    const code = await host.mutation(api.meetings.scheduleMeeting, {
      title: "Design review",
      startTime: Date.now() + 60 * 60_000,
      durationMinutes: 30,
      attendees: ["invitee@example.com"],
    });

    // The host sees it in listUpcoming; the invitee sees it in listInvited.
    expect(await host.query(api.meetings.listUpcoming)).toHaveLength(1);
    const invited = await invitee.query(api.meetings.listInvited);
    expect(invited).toHaveLength(1);
    expect(invited[0].code).toBe(code);

    // The invitee does not see it in listUpcoming (they don't host it).
    expect(await invitee.query(api.meetings.listUpcoming)).toHaveLength(0);

    // The host has no invited list for their own meeting.
    expect(await host.query(api.meetings.listInvited)).toHaveLength(0);

    // Cancelling notifies the registered attendee.
    await host.mutation(api.meetings.cancelScheduled, { code });
    expect(await invitee.query(api.meetings.listInvited)).toHaveLength(0);
    const notifications = await invitee.query(api.notifications.listNotifications);
    expect(notifications[0].type).toBe("meeting");
    expect(notifications[0].title).toContain("Cancelled: Design review");
  });
});

describe("RSVP flow", () => {
  it("only invited attendees can respond, and updates are stored per email", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const inviteeId = await insertUser(t, "invitee@example.com", "Invitee");
    const strangerId = await insertUser(t, "stranger@example.com", "Stranger");

    const host = t.withIdentity({ subject: hostId });
    const invitee = t.withIdentity({ subject: inviteeId });
    const stranger = t.withIdentity({ subject: strangerId });

    const code = await host.mutation(api.meetings.scheduleMeeting, {
      title: "Product sync",
      startTime: Date.now() + 60 * 60_000,
      durationMinutes: 30,
      attendees: ["invitee@example.com"],
    });

    // Non-invited users can't respond.
    await expect(
      stranger.mutation(api.meetings.respondRsvp, { code, status: "yes" }),
    ).rejects.toThrow("You weren't invited to this meeting.");

    // Invitee RSVPs yes → host is notified.
    await invitee.mutation(api.meetings.respondRsvp, { code, status: "yes" });
    const hostNotifs = await host.query(api.notifications.listNotifications);
    expect(hostNotifs[0].type).toBe("meeting");
    expect(hostNotifs[0].title).toContain("Invitee is coming");

    // Host sees the response on the scheduled meeting.
    const upcoming = await host.query(api.meetings.listUpcoming);
    expect(upcoming[0].rsvps).toEqual([
      { email: "invitee@example.com", status: "yes", respondedAt: expect.any(Number) },
    ]);

    // Changing the response replaces, not duplicates.
    await invitee.mutation(api.meetings.respondRsvp, { code, status: "maybe" });
    const after = await host.query(api.meetings.listUpcoming);
    expect(after[0].rsvps).toHaveLength(1);
    expect(after[0].rsvps![0].status).toBe("maybe");
  });
});

describe("managing attendees on a scheduled meeting", () => {
  it("lets the host add people, deduping against existing attendees and the host", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const newbieId = await insertUser(t, "bob@example.com", "Bob");

    const host = t.withIdentity({ subject: hostId });
    const code = await host.mutation(api.meetings.scheduleMeeting, {
      title: "Planning",
      startTime: Date.now() + 60 * 60_000,
      durationMinutes: 30,
      attendees: ["alice@example.com"],
    });

    const added = await host.mutation(api.meetings.addAttendees, {
      code,
      emails: ["BOB@example.com", "alice@example.com", "host@example.com", "nope"],
    });
    expect(added).toBe(1);

    const upcoming = await host.query(api.meetings.listUpcoming);
    expect(upcoming[0].attendees).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);

    // The newly added registered user is notified and sees the invite.
    const newbie = t.withIdentity({ subject: newbieId });
    const notifications = await newbie.query(api.notifications.listNotifications);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("invite");
    expect(notifications[0].title).toContain("Planning");

    const invited = await newbie.query(api.meetings.listInvited);
    expect(invited).toHaveLength(1);
    expect(invited[0].code).toBe(code);
  });

  it("rejects non-hosts and meetings that are no longer scheduled", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const inviteeId = await insertUser(t, "invitee@example.com", "Invitee");

    const host = t.withIdentity({ subject: hostId });
    const invitee = t.withIdentity({ subject: inviteeId });

    const code = await host.mutation(api.meetings.scheduleMeeting, {
      title: "Review",
      startTime: Date.now() + 60 * 60_000,
      durationMinutes: 30,
      attendees: ["invitee@example.com"],
    });

    await expect(
      invitee.mutation(api.meetings.addAttendees, {
        code,
        emails: ["carol@example.com"],
      }),
    ).rejects.toThrow("Only the host can add attendees.");
    await expect(
      invitee.mutation(api.meetings.resendInvites, { code }),
    ).rejects.toThrow("Only the host can re-send invites.");

    await host.mutation(api.meetings.cancelScheduled, { code });
    await expect(
      host.mutation(api.meetings.addAttendees, {
        code,
        emails: ["carol@example.com"],
      }),
    ).rejects.toThrow("no longer accepting new attendees");
  });

  it("re-sends invite emails to every current attendee", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");

    const host = t.withIdentity({ subject: hostId });
    const code = await host.mutation(api.meetings.scheduleMeeting, {
      title: "Standup",
      startTime: Date.now() + 60 * 60_000,
      durationMinutes: 15,
      attendees: ["alice@example.com", "bob@example.com"],
    });

    // Best-effort: returns the count of people emailed and never throws.
    const count = await host.mutation(api.meetings.resendInvites, { code });
    expect(count).toBe(2);
  });
});
