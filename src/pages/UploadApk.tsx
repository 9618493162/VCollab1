import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";

export default function UploadApkPage() {
  const upload = useAction(api.supabase.ensureAndUploadApk);
  const [result, setResult] = useState<{
    uploaded: boolean;
    path: string;
    size: number;
    url: string | undefined;
    error?: string;
  } | null>(null);

  useEffect(() => {
    upload({ fileName: "VCollab-1.0.0.apk" }).then(
      (r) => setResult(r),
      (e) => setResult({ uploaded: false, path: "", size: 0, url: undefined, error: String(e) }),
    );
  }, [upload]);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">Uploading APK to Supabase…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-xl rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
        <h1 className="text-lg font-semibold">APK upload</h1>
        {result.uploaded ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Uploaded <span className="font-mono text-foreground">{result.path}</span>
              {" "}({Math.round(result.size / 1024 / 1024 * 10) / 10} MB) to the
              <code className="text-foreground"> vcollab-apks</code> bucket.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Public download link:</span>
            </div>
            <a                href={result.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:brightness-110"
            >
              <ExternalLink className="size-4" /> {result.url}
            </a>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertCircle className="shrink-0 size-4 mt-0.5" />
              This is a public link. Anyone with it can download the APK. If that's
              wrong, switch the bucket back to private and serve via signed URLs instead.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Next step: add a{" "}
              <code className="text-foreground">/download</code> route in the app that links here, or
              keep this URL as the shareable install link.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-red-400">Upload failed: {result.error}</p>
        )}
      </div>
    </div>
  );
}

function ExternalLink({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function AlertCircle({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
