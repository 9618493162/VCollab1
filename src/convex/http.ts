// LiveKit webhook endpoint. LiveKit Cloud POSTs egress lifecycle events here
// (configure the URL as `{CONVEX_URL}/livekit-webhook` in the LiveKit
// dashboard → Webhooks). The request is signed with an HMAC-SHA256 of the raw
// body using the webhook secret (which defaults to the API secret), so no
// extra secret is needed — we verify with Web Crypto.
import { EgressStatus } from "@livekit/protocol";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

async function hexHmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

http.route({
  path: "/livekit-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;
    if (!key || !secret) {
      return new Response("LiveKit isn't configured.", { status: 500 });
    }
    const body = await request.text();
    const signature = request.headers.get("X-LiveKit-Signature") ?? "";
    const apiKeyHeader = request.headers.get("X-LiveKit-Api-Key");
    if (apiKeyHeader && apiKeyHeader !== key) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!signature || !safeEqual(await hexHmacSha256(secret, body), signature)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    const info = payload?.egress_info as
      | {
          egress_id?: string;
          status?: number;
          file_results?: { location?: string; filename?: string; duration?: number | string }[];
        }
      | undefined;
    if (info?.egress_id) {
      const file = info.file_results?.[0];
      let status: "running" | "complete" | "error" = "running";
      if (info.status === EgressStatus.EGRESS_COMPLETE) status = "complete";
      else if (
        info.status === EgressStatus.EGRESS_FAILED ||
        info.status === EgressStatus.EGRESS_ABORTED ||
        info.status === EgressStatus.EGRESS_LIMIT_REACHED
      ) {
        status = "error";
      }
      await ctx.runMutation(internal.recording.handleEgressEvent, {
        egressId: info.egress_id,
        status,
        url: file?.location || file?.filename,
        filename: file?.filename,
        durationMs: file?.duration != null ? Number(file.duration) : undefined,
      });
    }
    return new Response("OK", { status: 200 });
  }),
});

export default http;
