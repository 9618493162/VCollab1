import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2, Sparkles, Target, MessageCircle, ArrowRight, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MeetingInsightsProps {
  code: string;
}

export function MeetingInsights({ code }: MeetingInsightsProps) {
  const insights = useQuery(api.premium.getInsights, { code });
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!insights) return;
    const parts = [
      insights.summary && `## Summary\n${insights.summary}`,
      insights.keyDecisions?.length && `## Key Decisions\n${insights.keyDecisions.map((d) => `• ${d}`).join("\n")}`,
      insights.actionItems?.length && `## Action Items\n${insights.actionItems.map((a) => `• ${a.task}${a.assignee ? ` (${a.assignee})` : ""}${a.deadline ? ` — ${a.deadline}` : ""}`).join("\n")}`,
      insights.unresolvedQuestions?.length && `## Unresolved Questions\n${insights.unresolvedQuestions.map((q) => `• ${q}`).join("\n")}`,
      insights.nextSteps?.length && `## Next Steps\n${insights.nextSteps.map((s) => `• ${s}`).join("\n")}`,
    ].filter(Boolean).join("\n\n");

    await navigator.clipboard.writeText(parts);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (insights === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  if (insights === null) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted/40">
          <BarChart3 className="size-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground/70">No insights generated yet</p>
        <p className="mt-1 text-xs text-muted-foreground/50">
          Use the AI Assistant during the meeting to generate insights
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {insights.summary && (
        <Section title="Summary" icon={<Sparkles className="size-3.5" />}>
          <p className="text-sm leading-relaxed text-foreground/90">{insights.summary}</p>
        </Section>
      )}

      {/* Key Decisions */}
      {insights.keyDecisions?.length ? (
        <Section title="Key Decisions" icon={<Check className="size-3.5" />}>
          <ul className="space-y-1.5">
            {insights.keyDecisions.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span className="text-foreground/90">{d}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Action Items */}
      {insights.actionItems?.length ? (
        <Section title="Action Items" icon={<Target className="size-3.5" />}>
          <div className="space-y-2">
            {insights.actionItems.map((a, i) => (
              <div key={i} className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium text-foreground">{a.task}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground/70">
                  {a.assignee && <span>👤 {a.assignee}</span>}
                  {a.deadline && <span>📅 {a.deadline}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Unresolved Questions */}
      {insights.unresolvedQuestions?.length ? (
        <Section title="Unresolved Questions" icon={<MessageCircle className="size-3.5" />}>
          <ul className="space-y-1.5">
            {insights.unresolvedQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 text-amber-500">❓</span>
                <span className="text-foreground/90">{q}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Next Steps */}
      {insights.nextSteps?.length ? (
        <Section title="Next Steps" icon={<ArrowRight className="size-3.5" />}>
          <ul className="space-y-1.5">
            {insights.nextSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500/60" />
                <span className="text-foreground/90">{s}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Stats */}
      {insights.stats && (
        <Section title="Meeting Stats" icon={<BarChart3 className="size-3.5" />}>
          <div className="grid grid-cols-2 gap-2">
            {insights.stats.durationMs !== undefined && (
              <StatCard label="Duration" value={formatDuration(insights.stats.durationMs)} />
            )}
            {insights.stats.participantCount !== undefined && (
              <StatCard label="Participants" value={String(insights.stats.participantCount)} />
            )}
            {insights.stats.messageCount !== undefined && (
              <StatCard label="Messages" value={String(insights.stats.messageCount)} />
            )}
            {insights.stats.questionCount !== undefined && (
              <StatCard label="Questions" value={String(insights.stats.questionCount)} />
            )}
            {insights.stats.taskCount !== undefined && (
              <StatCard label="Tasks" value={String(insights.stats.taskCount)} />
            )}
          </div>
        </Section>
      )}

      {/* Copy button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleCopy()}
        className="w-full rounded-full"
      >
        {copied ? (
          <><Check className="mr-1.5 size-3.5" /> Copied!</>
        ) : (
          <><Copy className="mr-1.5 size-3.5" /> Copy All</>
        )}
      </Button>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {icon} {title}
      </h4>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-center">
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground/60">{label}</p>
    </div>
  );
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m ${secs % 60}s`;
}
