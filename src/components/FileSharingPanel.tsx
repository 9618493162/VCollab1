import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Download,
  FileUp,
  KeyRound,
  Loader2,
  Paperclip,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileSharingPanel({ code }: { code: string }) {
  const { user } = useAuth();
  const files = useQuery(api.supabaseData.listFiles, { code });
  const ping = useAction(api.supabase.ping);
  const createSignedUploadUrl = useAction(api.supabase.createSignedUploadUrl);
  const listFilesWithUrls = useAction(api.supabase.listFilesWithUrls);
  const deleteFile = useAction(api.supabase.deleteFile);
  const recordUpload = useMutation(api.supabaseData.recordUpload);

  const [config, setConfig] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    void ping().then((result) => {
      if (alive) setConfig(result);
    });
    return () => {
      alive = false;
    };
  }, [ping]);

  const refreshUrls = async () => {
    try {
      const rows = await listFilesWithUrls({ code });
      const next: Record<string, string> = {};
      for (const row of rows) {
        if (row.url) next[row._id] = row.url;
      }
      setUrls(next);
    } catch {
      // keys not configured yet — the notice card explains what to do
    }
  };

  useEffect(() => {
    if (config?.configured && files !== undefined) void refreshUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.configured, files?.length, code]);

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const { path, uploadUrl, uploadedBy, uploaderName } = await createSignedUploadUrl({
        code,
        fileName: file.name,
        size: file.size,
        contentType: file.type || undefined,
        uploaderName: user?.name ?? undefined,
      });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: file.type ? { "Content-Type": file.type } : undefined,
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
      await recordUpload({
        code,
        name: file.name,
        path,
        size: file.size,
        contentType: file.type || undefined,
        uploadedBy,
        uploadedByName: uploaderName,
      });
      toast.success("File shared.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (fileId: Id<"sharedFiles">) => {
    setDeletingId(fileId);
    try {
      await deleteFile({ fileId });
      toast.success("File removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the file.");
    } finally {
      setDeletingId(null);
    }
  };

  // Keys missing → tell the user exactly what to add.
  if (config && !config.configured) {
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
          <KeyRound className="size-5" />
        </span>
        <h3 className="font-display text-lg font-semibold">File sharing needs Supabase</h3>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Add{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">SUPABASE_URL</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          in the project Keys tab, then reload this page.
        </p>
      </div>
    );
  }

  const isReady = config?.configured;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Paperclip className="size-4 text-primary" /> Shared files
        </h2>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => void handlePick(e.target.files?.[0])}
        />
        <Button
          size="sm"
          className="rounded-full"
          disabled={!isReady || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <UploadCloud className="mr-1.5 size-3.5" />
          )}
          {uploading ? "Uploading…" : "Share a file"}
        </Button>
      </div>

      <div className="mt-5">
        {files === undefined ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading files…
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
            <FileUp className="size-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No files shared yet — share a spec, design, or notes with this meeting.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {files.map((file) => {
              const url = urls[file._id];
              return (
                <li
                  key={file._id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition-colors hover:border-border"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileUp className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(file.size)} · {file.uploadedByName} ·{" "}
                      {new Date(file.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-full"
                      aria-label={`Download ${file.name}`}
                      disabled={!url}
                      onClick={() => url && window.open(url, "_blank")}
                    >
                      <Download className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "size-8 rounded-full text-muted-foreground hover:text-destructive",
                      )}
                      aria-label={`Delete ${file.name}`}
                      disabled={deletingId === file._id}
                      onClick={() => void handleDelete(file._id)}
                    >
                      {deletingId === file._id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
