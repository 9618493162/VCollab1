"use node";

// Node-runtime module: reads API keys via process.env (set them in the
// project's Keys/API keys tab — never in the frontend). Only actions can be
// defined here; the query/mutation helpers live in aiData.ts.
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
  return await ctx.runQuery(api.aiData.getAiData, { code, kind });
}

/**
 * Transcribe a recorded meeting via AssemblyAI (speaker labels + summary),
 * then extract action items via OpenAI when a key is available.
 */
export const transcribeMeeting = action({
  args: { code: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { code, storageId }) => {
    const normalized = normalizeCode(code);
    if (normalized === "") throw new Error("Invalid meeting code.");
    const key = process.env.ASSEMBLYAI_API_KEY;
    if (!key)
      throw new Error(
        "AI transcription isn't configured — add ASSEMBLYAI_API_KEY in the project Keys tab.",
      );

    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new Error("Couldn't find the recording to transcribe.");
    const audio = await (await fetch(url)).arrayBuffer();

    const upload = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        authorization: key,
        "content-type": "application/octet-stream",
      },
      body: audio,
    });
    const { upload_url } = (await upload.json()) as { upload_url: string };

    const submit = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
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
      const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: key },
      });
      transcript = (await poll.json()) as typeof transcript;
      if (transcript.status === "completed" || transcript.status === "error") break;
    }
    if (transcript.status !== "completed") {
      throw new Error(
        transcript.error ?? "Transcription timed out. Try a shorter recording.",
      );
    }

    const lines = (transcript.utterances ?? [])
      .map((u) => `Speaker ${u.speaker.replace("S", "")}: ${u.text}`)
      .join("\n");
    const text = transcript.text ?? lines;
    const summary = transcript.summary ?? "No summary generated.";

    await ctx.runMutation(internal.aiData.storeAiData, {
      code: normalized,
      kind: "transcript",
      content: lines || text || "No speech detected.",
      model: "assemblyai-universal-2",
    });
    await ctx.runMutation(internal.aiData.storeAiData, {
      code: normalized,
      kind: "summary",
      content: summary,
      model: "assemblyai-universal-2",
    });

    if (process.env.OPENAI_API_KEY && (lines || text)) {
      const items = await extractActionItems(lines || text);
      if (items.length > 0) {
        await ctx.runMutation(internal.aiData.storeAiData, {
          code: normalized,
          kind: "actionItems",
          items,
          model: "gpt-4o-mini",
        });
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

/** Summarize an existing transcript + extract action items via OpenAI. */
export const summarizeTranscript = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw new Error(
        "AI summary isn't configured — add OPENAI_API_KEY in the project Keys tab.",
      );

    const latest = await loadAiData(ctx, normalized, "transcript");
    const transcript = latest[0]?.content ?? "";
    if (!transcript)
      throw new Error(
        "No transcript yet — record and transcribe the meeting first.",
      );

    const completion = await openaiChat(key, [
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
      content: completion,
      model: "gpt-4o-mini",
    });

    const items = await extractActionItems(transcript);
    if (items.length > 0) {
      await ctx.runMutation(internal.aiData.storeAiData, {
        code: normalized,
        kind: "actionItems",
        items,
        model: "gpt-4o-mini",
      });
    }
    await notifyHost(
      ctx,
      normalized,
      "AI summary ready",
      "Your meeting summary is available.",
      `/collab/${normalized}`,
    );
    return { summary: completion, items };
  },
});

/** Grounded Q&A over a meeting's transcript + summary. */
export const askAssistant = action({
  args: { code: v.string(), question: v.string() },
  handler: async (ctx, { code, question }) => {
    const normalized = normalizeCode(code);
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      return {
        answer:
          "The AI assistant isn't configured — add OPENAI_API_KEY in the project Keys tab.",
        grounded: false,
      };

    const [transcripts, summaries] = await Promise.all([
      loadAiData(ctx, normalized, "transcript"),
      loadAiData(ctx, normalized, "summary"),
    ]);
    const transcript = transcripts[0]?.content ?? "";
    const summary = summaries[0]?.content ?? "";
    if (!transcript && !summary)
      return {
        answer:
          "No transcript or summary for this meeting yet. Record and transcribe it first.",
        grounded: false,
      };

    const context = [
      summary ? `## Summary\n${summary}` : "",
      transcript ? `## Transcript\n${transcript.slice(0, 28_000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const answer = await openaiChat(key, [
      {
        role: "system",
        content:
          "You are a meeting assistant. Answer ONLY from the provided meeting context. If the context doesn't contain the answer, say so plainly — never invent information.",
      },
      { role: "user", content: `${context}\n\nQuestion: ${question}` },
    ]);
    return { answer, grounded: true };
  },
});

/** Translate a caption line into the target language (via OpenAI). */
export const translateText = action({
  args: { text: v.string(), target: v.string() },
  handler: async (ctx, { text, target }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw new Error(
        "Live translation isn't configured — add OPENAI_API_KEY in the project Keys tab.",
      );
    return openaiChat(key, [
      {
        role: "system",
        content: `Translate the user's message into ${target}. Return only the translation.`,
      },
      { role: "user", content: text },
    ]);
  },
});

/**
 * Generate structured meeting minutes from the transcript + agenda. Uses
 * OpenAI when OPENAI_API_KEY is set; otherwise falls back to a deterministic
 * summary assembled from the agenda and the opening transcript lines, so the
 * feature works without credentials (never fake data).
 */
export const generateMinutes = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    const key = process.env.OPENAI_API_KEY;

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
    if (key) {
      minutes = await openaiChat(key, [
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
    }

    await ctx.runMutation(internal.aiData.storeAiData, {
      code: normalized,
      kind: "minutes",
      content: minutes,
      model: key ? "gpt-4o-mini" : "agenda-fallback",
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

async function openaiChat(
  key: string,
  messages: { role: "system" | "user"; content: string }[],
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.4 }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function extractActionItems(transcript: string): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  const out = await openaiChat(key, [
    {
      role: "system",
      content:
        "Extract action items from the meeting transcript. Output a numbered list, one item per line, each starting with 'Task:' including who is responsible when mentioned. If there are no action items, output exactly 'NONE'.",
    },
    { role: "user", content: transcript.slice(0, 28_000) },
  ]);
  if (out.toUpperCase() === "NONE") return [];
  return out
    .split("\n")
    .map((l) => l.replace(/^\d+[.)]\s*/, "").replace(/^Task:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}
