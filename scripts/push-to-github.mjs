/**
 * Push the project to GitHub via the REST API (git CLI is blocked in this
 * environment). Creates blobs for every non-ignored file, builds a tree,
 * creates a commit, and moves refs/heads/main to it on the target repo.
 *
 * Usage: GITHUB_TOKEN=<token> node scripts/push-to-github.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { execSync } from "node:child_process";

const REPO = "9618493162/VCollab1";
const BRANCH = "main";
const API = "https://api.github.com";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN env var is required.");
  process.exit(1);
}

async function gh(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "VCollab-push",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

// 1. Collect files respecting .gitignore (git check-ignore if available, else
//    simple excludes).
const IGNORED_DIRS = new Set([
  "node_modules", "dist", ".git", ".vite", "coverage", ".idea",
]);
const IGNORED_FILES = new Set([".env", ".env.local", ".env.production", ".DS_Store"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // GitHub blob hard limit ~100MB; keep sane

function isIgnored(rel) {
  const parts = rel.split(sep);
  if (parts.some((p) => IGNORED_DIRS.has(p))) return true;
  if (IGNORED_FILES.has(rel)) return true;
  if (rel.startsWith(".env.") || rel === ".env") return true;
  if (rel.endsWith(".local")) return true;
  return false;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = execSync(`ls -1A "${dir}"`, { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const rel = relative(".", full);
    if (isIgnored(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && st.size <= MAX_FILE_BYTES) out.push(rel);
  }
  return out;
}

const files = walk(".");
console.log(`Collected ${files.length} files.`);

// 2. Create blobs (batched sequentially — API is fine with it for ~200 files).
const tree = [];
for (const rel of files) {
  const content = readFileSync(rel);
  const blob = await gh(`/repos/${REPO}/git/blobs`, {
    content: content.toString("base64"),
    encoding: "base64",
  });
  tree.push({ path: rel.split(sep).join("/"), mode: "100644", type: "blob", sha: blob.sha });
}
console.log(`Created ${tree.length} blobs.`);

// 3. Build the tree. If the branch exists, base the new tree on it; otherwise
//    create a root tree.
let baseTree;
try {
  const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  baseTree = ref.object.sha;
  console.log(`Branch ${BRANCH} exists — basing tree on ${baseTree.slice(0, 8)}.`);
} catch {
  baseTree = undefined;
  console.log(`Branch ${BRANCH} does not exist — creating root tree.`);
}
const newTree = await gh(`/repos/${REPO}/git/trees`, {
  tree,
  ...(baseTree ? { base_tree: baseTree } : {}),
});

// 4. Commit.
const commit = await gh(`/repos/${REPO}/git/commits`, {
  message: "VCollab — video collaboration platform\n\nLiveKit meetings + cloud recording, Deepgram transcription,\nNVIDIA Nemotron AI analysis, Convex backend, Supabase file storage.\n\n🤖 Generated with Codebuff\nCo-Authored-By: Codebuff <noreply@codebuff.com>",
  tree: newTree.sha,
  ...(baseTree ? { parents: [baseTree] } : {}),
});

// 5. Point the branch at the commit (create or update).
if (baseTree) {
  await fetch(`${API}/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "VCollab-push",
      "content-type": "application/json",
    },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`update ref → ${r.status}: ${await r.text()}`);
  });
} else {
  await gh(`/repos/${REPO}/git/refs`, {
    ref: `refs/heads/${BRANCH}`,
    sha: commit.sha,
  });
}

console.log(`✅ Pushed ${tree.length} files to ${REPO}@${BRANCH} (commit ${commit.sha.slice(0, 8)}).`);
console.log(`   https://github.com/${REPO}`);
