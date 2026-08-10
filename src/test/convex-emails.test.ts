import { describe, expect, it } from "vitest";
import { buildMeetingEmail } from "../convex/emails";

const meeting = {
  code: "abc-defg-hij",
  title: "Sprint planning",
  startTime: new Date("2026-08-15T10:00:00").getTime(),
  durationMinutes: 30,
  description: "Review roadmap priorities",
};

describe("buildMeetingEmail", () => {
  it("builds an invite email with title, time, code, and join link", () => {
    const email = buildMeetingEmail(meeting, "invite");
    expect(email.subject).toContain("You're invited");
    expect(email.subject).toContain("Sprint planning");
    expect(email.text).toContain("abc-defg-hij");
    expect(email.text).toContain("/call/abc-defg-hij");
    expect(email.text).toContain("Review roadmap priorities");
    expect(email.html).toContain("Join meeting");
    expect(email.html).toContain("abc-defg-hij");
  });

  it("builds a reminder email that says it starts soon", () => {
    const email = buildMeetingEmail(meeting, "reminder");
    expect(email.subject).toContain("Reminder");
    expect(email.text).toContain("starts in about 10 minutes");
  });

  it("builds a cancellation email without a join link", () => {
    const email = buildMeetingEmail(meeting, "cancelled");
    expect(email.subject).toContain("Cancelled");
    expect(email.text).toContain("is no longer happening");
    expect(email.text).not.toContain("Join here");
    expect(email.html).toContain("Go to VCollab");
  });

  it("omits the description row when absent", () => {
    const { description: _unused, ...withoutDesc } = meeting;
    const email = buildMeetingEmail(withoutDesc, "invite");
    expect(email.text).not.toContain("About:");
    expect(email.html).not.toContain("Review roadmap priorities");
  });
});
