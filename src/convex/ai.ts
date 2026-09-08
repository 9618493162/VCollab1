"use node";

// Node-runtime module: reads API keys via process.env (set them in the
// project's Keys/API keys tab — never in the frontend). Only actions can be
// defined here; the query/mutation helpers live in aiData.ts.
//
// Providers:
//   Transcription: DEEPGRAM_API_KEY (primary) → ASSEMBLYAI_API_KEY (fallback)
//   LLM features (summary, action items, assistant, translation, minutes):
//     NVIDIA_API_KEY (meta/muse-glimmer-30b via NVIDIA NIM)
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { normalizeCode } from "./rooms";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notifyHost(
  ctx: ActionCtx,
  code: string,
  title: string,
  body?: string,
  link?: string,
) {
  const hostId = await ctx.runQuery(internal.aiData.getRoomHost, { code });
  if (hostId === null) return;
  const wantsSummaries = await ctx.runQuery(internal.settings.shouldNotify, {
    userId: hostId,
    type: "ai",
  });
  if (!wantsSummaries) return;
  await ctx.runMutation(internal.notifications.push, {
    userId: hostId,
    type: "ai",
    title,
    body,
    link,
  });
}

async function loadAiData(
  ctx: ActionCtx,
  code: string,
  kind: string,
): Promise<{ content?: string; items?: string[] }[]> {
  // Access is verified by requireMeetingAccess before this runs.
  return await ctx.runQuery(internal.aiData.getAiDataUnverified, { code, kind });
}

/** Every meeting-scoped AI feature verifies the caller is the host or a
 *  current participant before touching that meeting's transcript/artifacts. */
async function requireMeetingAccess(ctx: ActionCtx, code: string) {
  const userId = await getAuthUserId(ctx);
  await ctx.runQuery(internal.aiData.assertAiAccess, {
    code,
    userId: userId ?? null,
  });
}

const LLM_NOT_CONFIGURED =
  "AI isn't configured — add NVIDIA_API_KEY in the project Keys tab.";

/** NVIDIA NIM model for chat completions. */
const NVIDIA_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Return the NVIDIA NIM provider config, or null if the key is missing. */
function pickLlm(): {
  key: string;
  baseUrl: string;
  model: string;
  label: string;
} | null {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  return {
    key,
    baseUrl: NVIDIA_BASE_URL,
    model: NVIDIA_MODEL,
    label: "nvidia-nim",
  };
}

/** OpenAI-compatible chat completion against NVIDIA NIM. */
async function llmChat(
  messages: { role: "system" | "user"; content: string }[],
): Promise<{ text: string; model: string }> {
  const provider = pickLlm();
  if (!provider) throw new Error(LLM_NOT_CONFIGURED);
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.key}`,
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 16384,
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403)
      throw new Error("Invalid or expired NVIDIA API key. Get a new key at build.nvidia.com.");
    if (res.status === 429)
      throw new Error("NVIDIA API rate limit — try again in a moment.");
    throw new Error(
      `NVIDIA API error (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string | null; reasoning_content?: string };
    }[];
  };
  const message = data.choices?.[0]?.message;
  // Nemotron reasoning models may return the answer in reasoning_content
  // when content is null. Fall back to reasoning text so the user gets
  // a real response.
  const text = (message?.content ?? message?.reasoning_content ?? "").trim();
  return {
    text,
    model: provider.model,
  };
}

/**
 * Transcribe a recorded meeting. Uses Deepgram (speaker diarization +
 * smart formatting) when DEEPGRAM_API_KEY is set, falling back to
 * AssemblyAI. Summary + action items are generated via the configured
 * NVIDIA NIM when NVIDIA_API_KEY is set.
 */
export const transcribeMeeting = action({
  args: { code: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { code, storageId }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("Invalid meeting code.");
    await requireMeetingAccess(ctx, normalized);
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    const assemblyKey = process.env.ASSEMBLYAI_API_KEY;
    if (!deepgramKey && !assemblyKey)
      throw new Error(
        "AI transcription isn't configured — add DEEPGRAM_API_KEY or ASSEMBLYAI_API_KEY in the project Keys tab.",
      );

    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new Error("Couldn't find the recording to transcribe.");
    const audio = await (await fetch(url)).arrayBuffer();

    let lines: string;
    let text: string;
    let sttModel: string;

    if (deepgramKey) {
      // Deepgram pre-recorded: raw audio POST, diarized utterances.
      const res = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&utterances=true&diarize=true&smart_format=true",
        {
          method: "POST",
          headers: {
            authorization: `Token ${deepgramKey}`,
            "content-type": "application/octet-stream",
          },
          body: audio,
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Deepgram transcription failed (${res.status}): ${body.slice(0, 200)}`,
        );
      }
      const data = (await res.json()) as {
        results?: {
          channels?: { alternatives?: { transcript?: string }[] }[];
          utterances?: { speaker?: number; transcript?: string }[];
        };
      };
      const alt = data.results?.channels?.[0]?.alternatives?.[0];
      const utterances = data.results?.utterances ?? [];
      if (!alt?.transcript) {
        throw new Error(
          "Deepgram returned no transcript — the recording may be silent.",
        );
      }
      text = alt.transcript;
      lines =
        utterances.length > 0
          ? utterances
              .map((u) => `Speaker ${(u.speaker ?? 0) + 1}: ${u.transcript}`)
              .join("\n")
          : text;
      sttModel = "deepgram-nova-3";
    } else {
      // AssemblyAI fallback: upload → transcript job → poll.
      const upload = await fetch("https://api.assemblyai.com/v2/upload", {
        method: "POST",
        headers: {
          authorization: assemblyKey!,
          "content-type": "application/octet-stream",
        },
        body: audio,
      });
      const { upload_url } = (await upload.json()) as { upload_url: string };

      const submit = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: {
          authorization: assemblyKey!,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          audio_url: upload_url,
          speaker_labels: true,
          summarization: true,
          summary_type: "bullets",
        }),
      });
      const { id } = (await submit.json()) as { id: string };

      let transcript: {
        status: string;
        text?: string;
        summary?: string;
        utterances?: { speaker: string; text: string }[];
        error?: string;
      } = { status: "queued" };
      for (let i = 0; i < 60; i++) {
        await sleep(3000);
        const poll = await fetch(
          `https://api.assemblyai.com/v2/transcript/${id}`,
          { headers: { authorization: assemblyKey! } },
        );
        transcript = (await poll.json()) as typeof transcript;
        if (transcript.status === "completed" || transcript.status === "error")
          break;
      }
      if (transcript.status !== "completed") {
        throw new Error(
          transcript.error ?? "Transcription timed out. Try a shorter recording.",
        );
      }
      lines = (transcript.utterances ?? [])
        .map((u) => `Speaker ${u.speaker.replace("S", "")}: ${u.text}`)
        .join("\n");
      text = transcript.text ?? lines;
      sttModel = "assemblyai-universal-2";

      if (transcript.summary) {
        await ctx.runMutation(internal.aiData.storeAiData, {
          code: normalized,
          kind: "summary",
          content: transcript.summary,
          model: sttModel,
        });
      }
    }

    await ctx.runMutation(internal.aiData.storeAiData, {
      code: normalized,
      kind: "transcript",
      content: lines || text || "No speech detected.",
      model: sttModel,
    });

    // LLM-powered summary + action items when a provider is configured.
    let summary = "";
    if (pickLlm()) {
      const src = lines || text;
      try {
        const { text: s, model } = await llmChat([
          {
            role: "system",
            content:
              "You summarize meeting transcripts. Respond with: an Overview (2-3 sentences), Key Points (bullets), and Decisions (bullets). Keep it tight, no preamble.",
          },
          { role: "user", content: src.slice(0, 28_000) },
        ]);
        summary = s;
        await ctx.runMutation(internal.aiData.storeAiData, {
          code: normalized,
          kind: "summary",
          content: s,
          model,
        });
        const items = await extractActionItems(src);
        if (items.length > 0) {
          await ctx.runMutation(internal.aiData.storeAiData, {
            code: normalized,
            kind: "actionItems",
            items,
            model,
          });
        }
      } catch {
        // Non-fatal: transcript is still saved; summary can be requested later.
      }
    }

    await notifyHost(
      ctx,
      normalized,
      "AI summary ready",
      "Your meeting transcript and summary are available.",
      `/collab/${normalized}`,
    );
    return { transcript: lines || text, summary };
  },
});

/** Summarize an existing transcript + extract action items via the LLM provider. */
export const summarizeTranscript = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    await requireMeetingAccess(ctx, normalized);

    const latest = await loadAiData(ctx, normalized, "transcript");
    const transcript = latest[0]?.content ?? "";
    if (!transcript)
      throw new Error(
        "No transcript yet — record and transcribe the meeting first.",
      );

    const { text, model } = await llmChat([
      {
        role: "system",
        content:
          "You summarize meeting transcripts. Respond with: an Overview (2-3 sentences), Key Points (bullets), and Decisions (bullets). Keep it tight, no preamble.",
      },
      { role: "user", content: transcript.slice(0, 28_000) },
    ]);
    await ctx.runMutation(internal.aiData.storeAiData, {
      code: normalized,
      kind: "summary",
      content: text,
      model,
    });

    const items = await extractActionItems(transcript);
    if (items.length > 0) {
      await ctx.runMutation(internal.aiData.storeAiData, {
        code: normalized,
        kind: "actionItems",
        items,
        model,
      });
    }
    await notifyHost(
      ctx,
      normalized,
      "AI summary ready",
      "Your meeting summary is available.",
      `/collab/${normalized}`,
    );
    return { summary: text, items };
  },
});

/** Grounded Q&A over a meeting's transcript + summary. */
export const askAssistant = action({
  args: { code: v.string(), question: v.string() },
  handler: async (ctx, { code, question }) => {
    const normalized = normalizeCode(code);
    await requireMeetingAccess(ctx, normalized);
    if (!pickLlm())
      return {
        answer:
          "The AI assistant isn't configured — add NVIDIA_API_KEY in the project Keys tab (get one at build.nvidia.com).",
        grounded: false,
      };

    const [transcripts, summaries] = await Promise.all([
      loadAiData(ctx, normalized, "transcript"),
      loadAiData(ctx, normalized, "summary"),
    ]);
    const transcript = transcripts[0]?.content ?? "";
    const summary = summaries[0]?.content ?? "";

    const contextParts = [
      summary ? `## Summary\n${summary}` : "",
      transcript ? `## Transcript\n${transcript.slice(0, 28_000)}` : "",
    ].filter(Boolean);
    const hasContext = contextParts.length > 0;
    const context = contextParts.join("\n\n");

    const { text: answer } = await llmChat([
      {
        role: "system",
        content: hasContext
          ? "You are a meeting assistant. Answer ONLY from the provided meeting context. If the context doesn't contain the answer, say so plainly — never invent information."
          : "You are a helpful meeting assistant. There is no transcript or summary available yet for this meeting. Answer the user's question helpfully based on general knowledge. Be concise.",
      },
      { role: "user", content: hasContext ? `${context}\n\nQuestion: ${question}` : question },
    ]);
    return { answer, grounded: hasContext };
  },
});

/** Translate a caption line into the target language (via the LLM provider). */
export const translateText = action({
  args: { text: v.string(), target: v.string() },
  handler: async (ctx, { text, target }) => {
    if (!pickLlm()) throw new Error(LLM_NOT_CONFIGURED);
    const { text: translated } = await llmChat([
      {
        role: "system",
        content: `Translate the user's message into ${target}. Return only the translation.`,
      },
      { role: "user", content: text },
    ]);
    return translated;
  },
});

/**
 * Generate structured meeting minutes from the transcript + agenda. Uses
 * NVIDIA NIM when NVIDIA_API_KEY is set; otherwise
 * falls back to a deterministic summary assembled from the agenda and the
 * opening transcript lines, so the feature works without credentials
 * (never fake data).
 */
export const generateMinutes = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    await requireMeetingAccess(ctx, normalized);
    const provider = pickLlm();

    const [transcripts, agenda] = await Promise.all([
      loadAiData(ctx, normalized, "transcript"),
      ctx.runQuery(api.agenda.listAgenda, { code: normalized }),
    ]);
    const transcript = transcripts[0]?.content ?? "";
    const items = agenda ?? [];

    const agendaBlock = items
      .map(
        (item, i) =>
          `${i + 1}. ${item.title}${item.presenter ? ` (${item.presenter})` : ""}${item.status === "done" ? " — done" : ""}`,
      )
      .join("\n");

    if (!transcript && items.length === 0) {
      throw new Error(
        "Nothing to write minutes from yet — record/transcribe the meeting or set an agenda first.",
      );
    }

    let minutes: string;
    let model: string;
    if (provider) {
      const { text, model: m } = await llmChat([
        {
          role: "system",
          content:
            "You write concise, well-structured meeting minutes. Output exactly these sections: ## Overview, ## Key Points, ## Decisions, ## Action Items (with owners when named), ## Follow-ups. No preamble, no fluff.",
        },
        {
          role: "user",
          content: [
            items.length > 0 ? `## Agenda\n${agendaBlock}` : "",
            transcript ? `## Transcript\n${transcript.slice(0, 28_000)}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ]);
      minutes = text;
      model = m;
    } else {
      // Deterministic fallback: real data, just not LLM-polished.
      const heads = transcript
        .split("\n")
        .filter(Boolean)
        .slice(0, 12);
      minutes = [
        "## Overview",
        items.length > 0
          ? `Meeting covered ${items.length} agenda item(s).`
          : "No agenda was set for this meeting.",
        items.length > 0 ? `## Agenda\n${agendaBlock}` : "",
        heads.length > 0
          ? `## Key Points\n${heads.map((l) => `- ${l}`).join("\n")}`
          : "",
        "## Action Items\n- (add follow-ups on the meeting's task board)",
      ]
        .filter(Boolean)
        .join("\n\n");
      model = "agenda-fallback";
    }

    await ctx.runMutation(internal.aiData.storeAiData, {
      code: normalized,
      kind: "minutes",
      content: minutes,
      model,
    });

    await notifyHost(
      ctx,
      normalized,
      "Meeting minutes ready",
      "Structured minutes were generated for your meeting.",
      `/collab/${normalized}`,
    );
    return { minutes };
  },
});

// ---- helpers ------------------------------------------------------------

async function extractActionItems(transcript: string): Promise<string[]> {
  if (!pickLlm()) return [];
  const { text } = await llmChat([
    {
      role: "system",
      content:
        "Extract action items from the meeting transcript. Output a numbered list, one item per line, each starting with 'Task:' including who is responsible when mentioned. If there are no action items, output exactly 'NONE'.",
    },
    { role: "user", content: transcript.slice(0, 28_000) },
  ]);
  if (text.toUpperCase() === "NONE") return [];
  return text
    .split("\n")
    .map((l) => l.replace(/^\d+[.)]\s*/, "").replace(/^Task:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * Transcribe a short audio chunk via Deepgram's pre-recorded REST API.
 * Used for live transcription polling: the client captures ~3 s of PCM,
 * encodes it as a WAV, base64-encodes it, and posts it here. The result
 * is appended to the meeting's live transcript in Convex.
 *
 * If DEEPGRAM_API_KEY is not set, returns an error so the client can
 * fall back to the browser's Web Speech API.
 */
export const transcribeChunk = action({
  args: {
    code: v.string(),
    audioBase64: v.string(),
    sampleRate: v.number(),
  },
  handler: async (ctx, { code, audioBase64, sampleRate }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("Invalid meeting code.");
    await requireMeetingAccess(ctx, normalized);

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey)
      throw new Error(
        "DEEPGRAM_API_KEY is not set — add it in the project Keys tab.",
      );

    // Decode base64 → raw bytes.
    const audioBytes = Uint8Array.from(atob(audioBase64), (c) =>
      c.charCodeAt(0),
    );

    // Deepgram pre-recorded endpoint: accepts WAV/OGG/MP3/WebM.
    const params = new URLSearchParams({
      model: "nova-3",
      smart_format: "true",
      language: "en",
      utterances: "true",
      diarize: "true",
    });
    const res = await fetch(
      `https://api.deepgram.com/v1/listen?${params.toString()}`,
      {
        method: "POST",
        headers: {
          authorization: `Token ${deepgramKey}`,
          "content-type": "audio/wav",
        },
        body: audioBytes,
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Deepgram chunk transcription failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      results?: {
        channels?: {
          alternatives?: { transcript?: string }[];
        }[];
        utterances?: { speaker?: number; transcript?: string }[];
      };
    };

    const utterances = data.results?.utterances ?? [];
    let text = "";

    if (utterances.length > 0) {
      text = utterances
        .map((u) => `Speaker ${(u.speaker ?? 0) + 1}: ${u.transcript}`)
        .join("\n");
    } else {
      text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    }

    // Persist to the live transcript for AI use.
    if (text.trim()) {
      await ctx.runMutation(api.aiData.appendLiveTranscript, {
        code: normalized,
        lines: [text.trim()],
      });
    }

    return { text: text.trim() };
  },
});

/** Diagnostic: test whether the NVIDIA NIM key is set and working. */
export const testAiConnection = action({
  args: {},
  handler: async () => {
    const key = process.env.NVIDIA_API_KEY;
    if (!key)
      return { ok: false, error: "NVIDIA_API_KEY is not set in Convex environment variables." };

    try {
      const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [{ role: "user", content: "Say hello in one word." }],
          stream: false,
          temperature: 0.6,
          max_tokens: 100,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `NVIDIA NIM returned ${res.status}: ${body.slice(0, 300)}` };
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; reasoning_content?: string } }[];
      };
      const msg = data.choices?.[0]?.message;
      const reply = (msg?.content ?? msg?.reasoning_content ?? "").trim();
      return { ok: true, reply: reply.slice(0, 200) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

/** Diagnostic: test whether the Deepgram key is set and working. */
export const testDeepgramConnection = action({
  args: {},
  handler: async () => {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key)
      return { ok: false, error: "DEEPGRAM_API_KEY is not set." };
    try {
      // Deepgram's projects endpoint validates the key.
      const res = await fetch("https://api.deepgram.com/v1/projects", {
        headers: { authorization: `Token ${key}` },
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Deepgram API returned ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true, reply: "Deepgram connected" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
