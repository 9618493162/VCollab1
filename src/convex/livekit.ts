"use node";

// LiveKit cloud recording. Runs in the node runtime because it talks to the
// LiveKit Cloud REST API and signs JWTs — keys come from the project's
// Keys/API keys tab (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET),
// never from the frontend.
//
// Architecture: the live call stays a peer-to-peer mesh (signaling via
// Convex). When a host/co-host starts a recording, every participant ALSO
// publishes their mic/cam (and screen share) to a LiveKit room named after
// the meeting code, and the server starts a RoomComposite egress against
// that room. Egress runs on LiveKit's servers, so it keeps recording full
// quality video even if the starter's tab closes — it only stops when the
// room empties or the starter explicitly stops it.
import { v } from "convex/values";
import { EncodedFileOutput } from "@livekit/protocol";
import {
  AccessToken,
  EgressClient,
  EgressStatus,
  RoomServiceClient,
} from "livekit-server-sdk";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { normalizeCode } from "./rooms";

const CONFIG_HINT =
  "LiveKit isn't configured — add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in the project Keys tab.";

function liveKitClients() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error(CONFIG_HINT);
  return {
    url,
    key,
    secret,
    roomService: new RoomServiceClient(url, key, secret),
    egress: new EgressClient(url, key, secret),
  };
}

/** Host, or a co-host whose client is currently in the room. */
async function canModerate(
  ctx: ActionCtx,
  code: string,
  userId: Id<"users">,
): Promise<boolean> {
  const room = await ctx.runQuery(api.rooms.getRoom, { code });
  if (!room) return false;
  if (room.createdBy === userId) return true;
  const settings = await ctx.runQuery(api.security.getMeetingSettings, {
    code,
  });
  if (!settings) return false;
  const participants = await ctx.runQuery(api.call.listParticipants, {
    code,
  });
  const mine = participants.find(
    (p: { clientId: string; userId?: Id<"users"> }) => p.userId === userId,
  );
  return mine !== undefined && settings.coHosts.includes(mine.clientId);
}

/**
 * Reject when the meeting is not live. Critical security gate: LiveKit
 * tokens are only ever minted for meetings the backend says are joinable
 * (status scheduled/active and not past expiresAt).
 */
async function assertMeetingLive(ctx: ActionCtx, code: string): Promise<void> {
  const room = await ctx.runQuery(api.rooms.getRoom, { code });
  if (!room) throw new Error("This meeting doesn't exist.");
  const terminal =
    room.status === "ended" ||
    room.status === "cancelled" ||
    room.status === "expired";
  if (terminal || room.expired === true) {
    throw new Error("This meeting is no longer active.");
  }
  if (room.status !== "active" && room.status !== "scheduled") {
    throw new Error("This meeting is no longer active.");
  }
}

/** Mint a short-lived token that lets this client publish to the recording room. */
export const getParticipantToken = action({
  args: {
    code: v.string(),
    clientId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { code, clientId, name }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    // Never mint a LiveKit token for a meeting the backend says is over.
    await assertMeetingLive(ctx, normalized);
    const { url, key, secret } = liveKitClients();
    // Only people actually in the meeting may join the recording room.
    const participants = await ctx.runQuery(api.call.listParticipants, {
      code: normalized,
    });
    if (!participants.some((p: { clientId: string }) => p.clientId === clientId))
      throw new Error("Join the meeting before connecting to the cloud recorder.");

    const token = new AccessToken(key, secret, {
      identity: clientId,
      name: name.trim().slice(0, 40) || "Guest",
    });
    token.addGrant({
      roomJoin: true,
      room: normalized,
      canPublish: true,
      canSubscribe: true,
    });
    return { url, token: await token.toJwt() };
  },
});

/**
 * Start a server-side cloud recording: create the LiveKit room, kick off a
 * RoomComposite egress, and broadcast the state to every participant (they
 * each connect + publish via getParticipantToken).
 */
export const startRoomRecording = action({
  args: {
    code: v.string(),
    clientId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { code, clientId, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to start a cloud recording.");
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const userId = identity.subject as Id<"users">;
    await assertMeetingLive(ctx, normalized);
    if (!(await canModerate(ctx, normalized, userId)))
      throw new Error("Only the host or a co-host can start a cloud recording.");
    const live = await ctx.runQuery(api.recording.getRecordingState, {
      code: normalized,
    });
    if (live?.active === true) throw new Error("A recording is already in progress.");

    const { roomService, egress } = liveKitClients();

    // Creating an existing room errors — that's fine, it just means the room
    // is already up (e.g. a previous meeting used the same code).
    try {
      await roomService.createRoom({ name: normalized });
    } catch {
      // room already exists
    }

    let egressId = "";
    try {
      const info = await egress.startRoomCompositeEgress(
        normalized,
        {
          file: new EncodedFileOutput({
            filepath: `recordings/${normalized}/${Date.now()}.mp4`,
          }),
        },
        { layout: "grid" },
      );
      egressId = info.egressId;
      await ctx.runMutation(internal.recording.startCloudRecording, {
        code: normalized,
        clientId,
        byName: name.trim().slice(0, 40) || "Guest",
        egressId,
        startedAt: Date.now(),
      });
    } catch (error) {
      if (egressId) {
        try {
          await egress.stopEgress(egressId);
        } catch {
          // already gone
        }
      }
      throw error;
    }
    return { egressId };
  },
});

/** Stop the cloud recording (starter only). Egress finalizes on LiveKit's side. */
export const stopRoomRecording = action({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to stop the recording.");
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const live = await ctx.runQuery(api.recording.getRecordingState, {
      code: normalized,
    });
    if (!live?.active) return { stopped: false };
    const userId = identity.subject as Id<"users">;
    if (!(await canModerate(ctx, normalized, userId)))
      throw new Error("Only the host or a co-host can stop the recording.");
    if (live.byClientId && live.byClientId !== clientId)
      throw new Error("Only the person who started the recording can control it.");

    if (live.egressId) {
      const { egress } = liveKitClients();
      try {
        await egress.stopEgress(live.egressId);
      } catch {
        // may already be ending on its own
      }
      await ctx.runMutation(internal.recording.markRecordingFinalizing, {
        egressId: live.egressId,
      });
    }
    await ctx.runMutation(internal.recording.clearRoomRecording, {
      code: normalized,
    });
    return { stopped: true };
  },
});

/**
 * Poll the egress status for a recording. Once the file is uploaded we persist
 * its URL so the meeting's Recordings tab can play it. Safe to call from any
 * client — finalizing is idempotent (keyed by egressId).
 */
export const checkEgress = action({
  args: { code: v.string(), egressId: v.string() },
  handler: async (ctx, { code, egressId }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("That meeting code doesn't look right.");
    const { egress } = liveKitClients();
    const all = await egress.listEgress({ roomName: normalized });
    const info = all.find((e) => e.egressId === egressId);
    if (!info) return { status: "unknown" as const };

    const file = info.fileResults?.[0];
    if (info.status === EgressStatus.EGRESS_COMPLETE) {
      await ctx.runMutation(internal.recording.finalizeCloudRecording, {
        code: normalized,
        egressId,
        url: file?.location || file?.filename || "",
        filename: file?.filename,
        durationMs: file?.duration != null ? Number(file.duration) : undefined,
        fileSize: file?.size != null ? Number(file.size) : undefined,
      });
      return { status: "ready" as const, url: file?.location || undefined };
    }
    if (
      info.status === EgressStatus.EGRESS_FAILED ||
      info.status === EgressStatus.EGRESS_ABORTED ||
      info.status === EgressStatus.EGRESS_LIMIT_REACHED
    ) {
      await ctx.runMutation(internal.recording.failCloudRecording, { egressId });
      return { status: "error" as const };
    }
    return { status: "recording" as const };
  },
});
