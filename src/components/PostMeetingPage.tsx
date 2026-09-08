/**
 * PostMeetingPage — Standalone full-page meeting analysis.
 *
 * Displays: Summary, Transcript, Recordings (with video player),
 * Action Items, Minutes, and Chat — all read from existing Convex
 * queries. No new backend code required.
 *
 * ISOLATED: does not modify any existing component.
 */
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeetingChat } from "@/components/MeetingChat";
import { RecordingViewer } from "@/components/RecordingViewer";
import {
  Sparkles,
  FileText,
  ClipboardList,
  MessageSquareText,
  Loader2,
  ArrowLeft,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface Props {
  code: string;
}

export function PostMeetingPage({ code }: Props) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Existing Convex queries — no new backend needed
  const summaries = useQuery(api.aiData.getAiData, { code, kind: "summary" });
  const transcripts = useQuery(api.aiData.getAiData, { code, kind: "transcript" });
  const actionItems = useQuery(api.aiData.getAiData, { code, kind: "actionItems" });
  const minutes = useQuery(api.aiData.getAiData, { code, kind: "minutes" });
  const recordings = useQuery(api.call.listRecordings, { code });
  const checkEgress = useAction(api.livekit.checkEgress);
  const summarize = useAction(api.ai.summarizeTranscript);
  const generateMinutes = useAction(api.ai.generateMinutes);
  const [generating, setGenerating] = useState(false);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);

  const summary = summaries?.[0];
  const transcript = transcripts?.[0];
  const items = actionItems?.[0]?.items ?? [];
  const meetingMinutes = minutes?.[0];

  // Check pending cloud recordings
  const pending = recordings?.find(
    (r) => r.egressId && r.status !== "ready" && r.status !== "error",
  );
  if (pending?.egressId) {
    void checkEgress({ code, egressId: pending.egressId }).catch(() => {});
  }

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await summarize({ code });
      toast.success("Summary generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Summary failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateMinutes = async () => {
    setGeneratingMinutes(true);
    try {
      await generateMinutes({ code });
      toast.success("Meeting minutes generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate minutes.");
    } finally {
      setGeneratingMinutes(false);
    }
  };

  const copySummary = () => {
    if (!summary?.content) return;
    void navigator.clipboard.writeText(summary.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMinutes = () => {
    if (!meetingMinutes?.content) return;
    const blob = new Blob([meetingMinutes.content], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}-minutes.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTranscript = () => {
    if (!transcript?.content) return;
    const blob = new Blob([transcript.content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader active="history" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => navigate("/history")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-xl font-bold">Meeting Analysis</h1>
            <p className="font-mono text-xs text-muted-foreground">{code}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              void navigator.clipboard.writeText(code);
              toast.success("Meeting code copied.");
            }}
          >
            <Copy className="mr-1.5 size-3.5" /> Copy code
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="summary">
          <TabsList className="mb-4 grid w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="summary">
              <Sparkles className="mr-1.5 size-3.5" /> Summary
            </TabsTrigger>
            <TabsTrigger value="minutes">
              <FileText className="mr-1.5 size-3.5" /> Minutes
            </TabsTrigger>
            <TabsTrigger value="actions">
              <ClipboardList className="mr-1.5 size-3.5" /> Actions
            </TabsTrigger>
            <TabsTrigger value="transcript">
              <FileText className="mr-1.5 size-3.5" /> Transcript
            </TabsTrigger>
            <TabsTrigger value="recordings">
              <MessageSquareText className="mr-1.5 size-3.5" /> Recordings
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquareText className="mr-1.5 size-3.5" /> Chat
            </TabsTrigger>
          </TabsList>

          {/* Summary */}
          <TabsContent value="summary">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              {summary ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-sm font-semibold">AI Summary</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full text-xs"
                      onClick={copySummary}
                    >
                      {copied ? (
                        <Check className="mr-1 size-3" />
                      ) : (
                        <Copy className="mr-1 size-3" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground">
                    {summary.content}
                  </pre>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Sparkles className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No summary yet{transcript ? " for this transcript" : ""}.
                  </p>
                  <Button
                    className="mt-4 rounded-full"
                    onClick={() => void handleGenerate()}
                    disabled={generating || !transcript}
                  >
                    {generating ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    {transcript ? "Generate with AI" : "Record & transcribe first"}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Minutes */}
          <TabsContent value="minutes">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              {meetingMinutes ? (
                <div>
                  <div className="mb-4 flex items-center justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={downloadMinutes}
                    >
                      <Download className="mr-1.5 size-3.5" /> Download .md
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-7">
                    {meetingMinutes.content}
                  </pre>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No minutes yet. Generate structured minutes from the transcript.
                  </p>
                  <Button
                    className="mt-4 rounded-full"
                    onClick={() => void handleGenerateMinutes()}
                    disabled={generatingMinutes}
                  >
                    {generatingMinutes ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 size-4" />
                    )}
                    Generate minutes
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Action Items */}
          <TabsContent value="actions">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              {items.length === 0 ? (
                <div className="py-12 text-center">
                  <ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No action items yet — generate a summary to extract them.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-border/60 p-3"
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <p className="text-sm leading-6">{item}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {/* Transcript */}
          <TabsContent value="transcript">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              {transcript ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-sm font-semibold">Transcript</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full text-xs"
                      onClick={downloadTranscript}
                    >
                      <Download className="mr-1 size-3" /> Download
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-muted-foreground">
                    {transcript.content}
                  </pre>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No transcript yet — record the meeting and it will be
                    transcribed automatically.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Recordings */}
          <TabsContent value="recordings">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              {recordings === undefined ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Loading…
                </p>
              ) : recordings.length === 0 ? (
                <div className="py-12 text-center">
                  <MessageSquareText className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No recordings for this meeting.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recordings.map((r) => (
                    <RecordingViewer key={r._id} recording={r} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Chat */}
          <TabsContent value="chat">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <MeetingChat code={code} readOnly className="max-h-[32rem]" />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
