import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("livekit cloud recording", () => {
  it("getParticipantToken fails with a clear hint when LiveKit isn't configured", async () => {
    const t = makeTestClient();
    await expect(
      t.action(api.livekit.getParticipantToken, {
        code: "abc-defg-hij",
        clientId: "c1",
        name: "Guest",
      }),
    ).rejects.toThrow("LiveKit isn't configured");
  });

  it("startRoomRecording requires host/co-host permissions before touching LiveKit", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const guestId = await insertUser(t, "guest@example.com", "Guest");
    const host = t.withIdentity({ subject: hostId });
    const guest = t.withIdentity({ subject: guestId });

    const code = await host.mutation(api.rooms.createRoom, {});

    // Non-host is rejected before any LiveKit call.
    await expect(
      guest.action(api.livekit.startRoomRecording, {
        code,
        clientId: "c-guest",
        name: "Guest",
      }),
    ).rejects.toThrow("Only the host or a co-host can start a cloud recording");

    // Host passes the permission check, then fails on missing env config.
    await expect(
      host.action(api.livekit.startRoomRecording, {
        code,
        clientId: "c-host",
        name: "Host",
      }),
    ).rejects.toThrow("LiveKit isn't configured");
  });

  it("stopRoomRecording fails cleanly when LiveKit isn't configured", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const host = t.withIdentity({ subject: hostId });
    const code = await host.mutation(api.rooms.createRoom, {});

    // Put a live cloud recording in place (via the internal mutation, since
    // the action would fail at the LiveKit call before it could ever start).
    await t.mutation(internal.recording.startCloudRecording, {
      code,
      clientId: "c-host",
      byName: "Host",
      egressId: "eg-0",
      startedAt: 1_700_000_000_000,
    });

    await expect(
      host.action(api.livekit.stopRoomRecording, { code, clientId: "c-host" }),
    ).rejects.toThrow("LiveKit isn't configured");
  });
});

describe("cloud recording lifecycle (internal mutations)", () => {
  it("broadcasts a cloud recording and finalizes the row when the egress completes", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const host = t.withIdentity({ subject: hostId });
    const code = await host.mutation(api.rooms.createRoom, {});

    // Start: room recording state is broadcast with mode cloud + egressId,
    // and a pending recordings row is created.
    await t.mutation(internal.recording.startCloudRecording, {
      code,
      clientId: "c-host",
      byName: "Host",
      egressId: "eg-1",
      startedAt: 1_700_000_000_000,
    });

    expect(
      await t.query(api.recording.getRecordingState, { code }),
    ).toMatchObject({
      active: true,
      paused: false,
      mode: "cloud",
      byClientId: "c-host",
      byName: "Host",
      egressId: "eg-1",
    });

    let rows = await t.query(api.call.listRecordings, { code });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ egressId: "eg-1", status: "recording" });
    expect(rows[0].url).toBeUndefined();

    // Egress finishes → the row gains its playback URL and status ready.
    await t.mutation(internal.recording.handleEgressEvent, {
      egressId: "eg-1",
      status: "complete",
      url: "https://cdn.livekit.cloud/recordings/abc.mp4",
      filename: "abc.mp4",
      durationMs: 65_000,
    });

    rows = await t.query(api.call.listRecordings, { code });
    expect(rows[0]).toMatchObject({
      status: "ready",
      url: "https://cdn.livekit.cloud/recordings/abc.mp4",
      filename: "abc.mp4",
      durationMs: 65_000,
    });

    // Stopping clears the live indicator so a new recording can start.
    await t.mutation(internal.recording.clearRoomRecording, { code });
    expect(await t.query(api.recording.getRecordingState, { code })).toBeNull();
  });

  it("marks the row as failed when the egress errors", async () => {
    const t = makeTestClient();
    const hostId = await insertUser(t, "host@example.com", "Host");
    const host = t.withIdentity({ subject: hostId });
    const code = await host.mutation(api.rooms.createRoom, {});

    await t.mutation(internal.recording.startCloudRecording, {
      code,
      clientId: "c-host",
      byName: "Host",
      egressId: "eg-2",
      startedAt: 1_700_000_000_000,
    });
    await t.mutation(internal.recording.handleEgressEvent, {
      egressId: "eg-2",
      status: "error",
    });

    const rows = await t.query(api.call.listRecordings, { code });
    expect(rows[0]).toMatchObject({ egressId: "eg-2", status: "error" });
    expect(rows[0].url).toBeUndefined();
  });

  it("ignores webhook events for unknown egress ids", async () => {
    const t = makeTestClient();
    await expect(
      t.mutation(internal.recording.handleEgressEvent, {
        egressId: "eg-unknown",
        status: "complete",
        url: "https://cdn/unknown.mp4",
      }),
    ).resolves.toBeNull();
  });
});
