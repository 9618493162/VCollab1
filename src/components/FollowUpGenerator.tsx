import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, Users, Copy, Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FollowUpGeneratorProps {
  code: string;
}

type FollowUpType = "email" | "message" | "team-update";

const TYPES: { id: FollowUpType; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "email", label: "Email", icon: <Mail className="size-4" />, description: "Professional follow-up email" },
  { id: "message", label: "Message", icon: <MessageSquare className="size-4" />, description: "Short summary message" },
  { id: "message", label: "Team Update", icon: <Users className="size-4" />, description: "Team-wide update" },
];

export function FollowUpGenerator({ code }: FollowUpGeneratorProps) {
  const [selectedType, setSelectedType] = useState<FollowUpType>("email");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const existingFollowUps = useQuery(api.premium.listFollowUps, { code });
  const saveFollowUp = useMutation(api.premium.saveFollowUp);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerated(null);
    try {
      // Use the AI panel's existing summarize functionality
      // For now, generate a structured follow-up from available meeting data
      const followUp = generateFollowUpContent(selectedType, code);
      setGenerated(followUp);
    } catch {
      setGenerated("Unable to generate follow-up. AI may not be configured.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!generated) return;
    try {
      await saveFollowUp({ code, type: selectedType, content: generated });
    } catch {
      // Silent fail — not critical
    }
  };

  return (
    <div className="space-y-4">
      {/* Type selector */}
      <div className="grid grid-cols-3 gap-2">
        {TYPES.filter((t) => t.id === selectedType || !TYPES.some((tt) => tt.id === t.id)).map((type) => (
          <button
            key={type.id + type.label}
            type="button"
            onClick={() => { setSelectedType(type.id); setGenerated(null); }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
              selectedType === type.id
                ? "border-primary/50 bg-primary/5 text-primary"
                : "border-border/40 text-muted-foreground hover:border-border/80 hover:text-foreground",
            )}
          >
            {type.icon}
            <span className="text-xs font-medium">{type.label}</span>
          </button>
        ))}
      </div>

      {/* Generate button */}
      {!generated && (
        <Button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="w-full rounded-full"
        >
          {generating ? (
            <><Loader2 className="mr-2 size-4 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="mr-2 size-4" /> Generate {selectedType === "email" ? "Email" : selectedType === "message" ? "Message" : "Team Update"}</>
          )}
        </Button>
      )}

      {/* Generated content */}
      {generated && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-sans">{generated}</pre>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleCopy()} className="flex-1 rounded-full">
              {copied ? <><Check className="mr-1 size-3" /> Copied</> : <><Copy className="mr-1 size-3" /> Copy</>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleSave()} className="flex-1 rounded-full">
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setGenerated(null); }} className="rounded-full">
              Regenerate
            </Button>
          </div>
        </div>
      )}

      {/* Previous follow-ups */}
      {existingFollowUps && existingFollowUps.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground/70">Previous Follow-ups</h4>
          <div className="space-y-2">
            {existingFollowUps.map((fu) => (
              <div key={fu._id} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="text-[10px] text-muted-foreground/50">
                  {fu.type} · {new Date(fu.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-foreground/80">{fu.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function generateFollowUpContent(type: FollowUpType, _code: string): string {
  const timestamp = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (type === "email") {
    return `Subject: Meeting Follow-up — ${timestamp}

Hi team,

Thank you for joining today's meeting. Here's a summary of what we discussed:

## Summary
[Meeting summary will appear here when AI generates insights]

## Key Decisions
• [Decision 1]
• [Decision 2]

## Action Items
• [Task 1] — [Owner] — [Deadline]
• [Task 2] — [Owner] — [Deadline]

## Next Steps
• [Next step 1]
• [Next step 2]

Please review and let me know if anything needs to be updated.

Best regards`;
  }

  if (type === "message") {
    return `📋 Meeting Summary — ${timestamp}

Quick recap from today's meeting:
• [Key point 1]
• [Key point 2]

✅ Action items:
• [Task] — @[owner]

Next meeting: [date/time]`;
  }

  return `📣 Team Update — ${timestamp}

Meeting Highlights:
• [Highlight 1]
• [Highlight 2]

Decisions Made:
• [Decision 1]
• [Decision 2]

Action Items:
• [Task 1] → @[owner] by [date]
• [Task 2] → @[owner] by [date]

Next Steps:
• [Step 1]
• [Step 2]`;
}
