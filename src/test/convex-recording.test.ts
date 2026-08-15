import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("meeting recording state", () => {
  it("requires auth to start a recording", async () => {
    const t = makeTestClient();
    await expect(
      t.mutation(api.recording.setRecordingState, {
        code: "abc-defg-hij",
        clientId: "c1",
        state: { active: true },
      }),
    ).rejects.toThrow("Sign in to manage recordings");
  });

  it("lets only the host start, and only the starter pause/resume/stop", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const guestId = await insertUser(t, "guest@example.com", "Guest");

    const host = t.withIdentity({ subject: hostId });
    const guest = t.withIdentity({ subject: guestId });

    const code = await host.mutation(api.meetings.scheduleMeeting, {
      title: "Rec test",
      startTime: Date.now() + 60 * 60_000,
      durationMinutes: 30,
    });

    // A non-host can't start a recording.
    await expect(
      guest.mutation(api.recording.setRecordingState, {
        code,
        clientId: "c-guest",
        state: { active: true },
      }),
    ).rejects.toThrow("Only the host or a co-host can control recordings");

    // The host starts it; everyone sees the live state.
    await host.mutation(api.recording.setRecordingState, {
      code,
      clientId: "c-host",
      state: { active: true, byClientId: "c-host", byName: "Host" },
    });
    const live = await t.query(api.recording.getRecordingState, { code });
    expect(live).toMatchObject({
      active: true,
      paused: false,
      byClientId: "c-host",
      byName: "Host",
    });

    // No second recording while one is in flight.
    await expect(
      host.mutation(api.recording.setRecordingState, {
        code,
        clientId: "c-host-2",
        state: { active: true },
      }),
    ).rejects.toThrow("A recording is already in progress");

    // Promote the guest to co-host: they can now moderate, but only the
    // starter may pause / resume / stop.
    await guest.mutation(api.call.joinRoom, {
      code,
      clientId: "c-guest",
      name: "Guest",
      userId: guestId,
    });
    await host.mutation(api.security.makeCoHost, { code, clientId: "c-guest" });
    await expect(
      guest.mutation(api.recording.setRecordingState, {
        code,
        clientId: "c-guest",
        state: { active: true, paused: true },
      }),
    ).rejects.toThrow("Only the person who started the recording");

    // Starter pauses and resumes.
    await host.mutation(api.recording.setRecordingState, {
      code,
      clientId: "c-host",
      state: { active: true, paused: true },
    });
    expect(await t.query(api.recording.getRecordingState, { code })).toMatchObject({
      active: true,
      paused: true,
    });
    await host.mutation(api.recording.setRecordingState, {
      code,
      clientId: "c-host",
      state: { active: true, paused: false },
    });
    expect(await t.query(api.recording.getRecordingState, { code })).toMatchObject({
      active: true,
      paused: false,
    });

    // Stopping clears the state entirely so a new recording can start.
    await host.mutation(api.recording.setRecordingState, {
      code,
      clientId: "c-host",
      state: { active: false },
    });
    expect(await t.query(api.recording.getRecordingState, { code })).toBeNull();
    await host.mutation(api.recording.setRecordingState, {
      code,
      clientId: "c-host",
      state: { active: true },
    });
    expect(await t.query(api.recording.getRecordingState, { code })).toMatchObject({
      active: true,
    });
  });

  it("returns null for an unknown or malformed code", async () => {
    const t = makeTestClient();
    expect(await t.query(api.recording.getRecordingState, { code: "nope" })).toBeNull();
    expect(await t.query(api.recording.getRecordingState, { code: "" })).toBeNull();
  });
});
