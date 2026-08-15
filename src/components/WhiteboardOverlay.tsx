import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { Eraser, PenLine, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const W = 1000;
const H = 600;

const COLORS = ["#ffffff", "#f87171", "#fbbf24", "#34d399", "#38bdf8", "#a78bfa"] as const;
const WIDTHS = [2, 4, 8] as const;

type Point = { x: number; y: number };
type Draft = { color: string; width: number; highlighter: boolean; points: Point[] };

function pathFromPoints(points: Point[]) {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

export function WhiteboardOverlay({
  code,
  isHost,
  clientId,
  name,
  onClose,
}: {
  code: string;
  isHost: boolean;
  clientId: string;
  name: string;
  onClose: () => void;
}) {
  const strokes = useQuery(api.whiteboard.listStrokes, { code });
  const saveStroke = useMutation(api.whiteboard.saveStroke);
  const deleteStroke = useMutation(api.whiteboard.deleteStroke);
  const clearWhiteboard = useMutation(api.whiteboard.clearWhiteboard);

  const [color, setColor] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  const [highlighter, setHighlighter] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const toLogical = (e: React.PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drawing.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
    setDraft({ color, width, highlighter, points: [toLogical(e)] });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = toLogical(e);
    setDraft((d) => (d ? { ...d, points: [...d.points, p] } : d));
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const done = draft;
    setDraft(null);
    if (!done || done.points.length < 2) return;
    void saveStroke({
      code,
      clientId,
      name,
      color: done.color,
      width: done.width,
      highlighter: done.highlighter,
      points: done.points,
    }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't save the stroke."),
    );
  };

  const myStrokes = useMemo(
    () => (strokes ?? []).filter((s) => s.clientId === clientId),
    [strokes, clientId],
  );

  const undo = () => {
    const last = myStrokes[myStrokes.length - 1];
    if (!last) {
      toast.error("Nothing of yours to undo.");
      return;
    }
    void deleteStroke({ code, strokeId: last._id, clientId }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't undo."),
    );
  };

  const clear = () => {
    if (!window.confirm("Clear the whole whiteboard for everyone?")) return;
    void clearWhiteboard({ code }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't clear the board."),
    );
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-md">
      {/* toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="size-4" /> Whiteboard
          <span className="hidden text-[11px] font-normal text-muted-foreground/70 sm:inline">
            {strokes?.length ?? 0} stroke{(strokes?.length ?? 0) === 1 ? "" : "s"}
          </span>
        </p>

        <div className="flex items-center gap-1.5">
          {/* colors */}
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={cn(
                  "size-4 rounded-full border transition-transform",
                  color === c ? "scale-110 border-border ring-1 ring-white/60" : "border-border/70",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* widths */}
          <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/50 px-1.5 py-1">
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                aria-label={`Width ${w}`}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                  width === w ? "bg-foreground/15" : "hover:bg-muted",
                )}
              >
                <span className="rounded-full bg-white" style={{ width: Math.max(2, w), height: Math.max(2, w) }} />
              </button>
            ))}
          </div>

          {/* highlighter */}
          <button
            type="button"
            onClick={() => setHighlighter((h) => !h)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors",
              highlighter
                ? "border-amber-400/50 bg-amber-400/15 text-amber-600 dark:text-amber-200"
                : "border-border/60 bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
          >
            <Eraser className="size-3.5" /> Highlight
          </button>

          <button
            type="button"
            onClick={undo}
            title="Undo my last stroke"
            className="flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Undo2 className="size-3.5" /> Undo
          </button>

          {isHost && (
            <Button
              size="sm"
              variant="outline"
              onClick={clear}
              className="h-8 rounded-full border-red-500/40 px-2.5 text-[11px] text-red-600 dark:text-red-300 hover:bg-red-500/15 hover:text-red-600 dark:text-red-300"
            >
              <Trash2 className="size-3.5" /> Clear
            </Button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close whiteboard"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* board */}
      <div className="min-h-0 flex-1 p-4">
        <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border/60 bg-white dark:bg-neutral-800">
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none select-none"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <rect x={0} y={0} width={W} height={H} fill="transparent" />
            {(strokes ?? []).map((s) => (
              <path
                key={s._id}
                d={pathFromPoints(s.points)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                opacity={s.highlighter ? 0.35 : 1}
              />
            ))}
            {draft && (
              <path
                d={pathFromPoints(draft.points)}
                fill="none"
                stroke={draft.color}
                strokeWidth={draft.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                opacity={draft.highlighter ? 0.35 : 1}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
