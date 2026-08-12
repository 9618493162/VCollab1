import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  FileText,
  MessageSquare,
  Search,
  Sparkles,
  StickyNote,
  Video,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

type Hit = { code: string; title: string; snippet?: string; match?: string };

const GROUPS: {
  key: "meetings" | "notes" | "tasks" | "chat" | "transcripts" | "files";
  label: string;
  icon: ReactNode;
  hint: string;
}[] = [
  { key: "meetings", label: "Meetings", icon: <Video className="size-3.5" />, hint: "hosted or scheduled" },
  { key: "notes", label: "Shared notes", icon: <StickyNote className="size-3.5" />, hint: "meeting notes" },
  { key: "tasks", label: "Tasks", icon: <FileText className="size-3.5" />, hint: "kanban cards" },
  { key: "chat", label: "Chat", icon: <MessageSquare className="size-3.5" />, hint: "in-call messages" },
  { key: "transcripts", label: "AI insights", icon: <Sparkles className="size-3.5" />, hint: "transcripts & summaries" },
  { key: "files", label: "Files", icon: <FileText className="size-3.5" />, hint: "shared files" },
];

function ResultRow({ hit, onClick }: { hit: Hit; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{hit.title}</span>
        {hit.snippet && (
          <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
            {hit.snippet}
          </span>
        )}
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground/70">
          {hit.code}
        </span>
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce so the reactive Convex query doesn't fire per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useQuery(api.search.searchAll, { q: debounced });
  const searching = debounced.length >= 2;
  const loading = searching && results === undefined;
  const total = results
    ? results.meetings.length +
      results.notes.length +
      results.tasks.length +
      results.chat.length +
      results.transcripts.length +
      results.files.length
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="search" />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-12 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Workspace search
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Find anything.
        </h1>

        <div className="relative mt-6">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings, notes, tasks, chat, transcripts, files…"
            className="h-12 rounded-2xl pl-11 pr-4 text-base shadow-sm"
          />
        </div>

        <div className="mt-6">
          {!searching ? (
            <div className="rounded-2xl border border-dashed border-border py-14 text-center">
              <Search className="mx-auto size-5 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                Type at least two characters to search across your workspace.
              </p>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-14 text-center">
              <p className="text-sm font-medium">Nothing found for “{debounced}”</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Try a shorter query, or search inside a specific meeting instead.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-xs tabular-nums text-muted-foreground">
                {total} result{total === 1 ? "" : "s"}
              </p>
              {GROUPS.map((group) => {
                const hits = results?.[group.key] ?? [];
                if (hits.length === 0) return null;
                return (
                  <section key={group.key}>
                    <h2 className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <span className="text-primary">{group.icon}</span>
                      {group.label}
                      <span className="text-muted-foreground/50">· {hits.length}</span>
                    </h2>
                    <div className="mt-2 space-y-0.5">
                      {hits.map((hit, i) => (
                        <ResultRow
                          key={`${group.key}-${hit.code}-${i}`}
                          hit={hit}
                          onClick={() => navigate(`/collab/${hit.code}`)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
                onClick={() => navigate("/dashboard")}
              >
                Back to dashboard
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
