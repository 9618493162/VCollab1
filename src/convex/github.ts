"use node";

// Node-runtime module: GitHub API access. Reads GITHUB_TOKEN via
// process.env (set it in the project's Keys/API keys tab — never in the
// frontend). Only actions can live here; queries/mutations stay in the
// regular runtime. All calls use the app's token, so results reflect the
// GitHub account the token belongs to.
import { v } from "convex/values";
import { action } from "./_generated/server";

const API = "https://api.github.com";
const HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "VCollab",
};

function token(): string {
  const key = process.env.GITHUB_TOKEN;
  if (!key)
    throw new Error(
      "GitHub isn't connected — add GITHUB_TOKEN in the project Keys tab.",
    );
  return key;
}

async function githubFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...HEADERS,
      authorization: `Bearer ${token()}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub request failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return res;
}

/** Return the GitHub account the configured token belongs to. */
export const getProfile = action({
  args: {},
  handler: async () => {
    const res = await githubFetch("/user");
    const data = (await res.json()) as {
      login: string;
      name?: string | null;
      avatar_url?: string | null;
      html_url?: string | null;
      bio?: string | null;
      public_repos?: number;
    };
    return {
      login: data.login,
      name: data.name ?? data.login,
      avatarUrl: data.avatar_url ?? null,
      htmlUrl: data.html_url ?? `https://github.com/${data.login}`,
      bio: data.bio ?? null,
      publicRepos: data.public_repos ?? 0,
    };
  },
});

/** List the account's repos (most recently updated first) for issue targets. */
export const listRepos = action({
  args: {},
  handler: async () => {
    const res = await githubFetch(
      "/user/repos?per_page=30&sort=updated&affiliation=owner,collaborator",
    );
    const data = (await res.json()) as {
      full_name: string;
      private?: boolean;
      description?: string | null;
    }[];
    return data.map((repo) => ({
      fullName: repo.full_name,
      isPrivate: repo.private ?? false,
      description: repo.description ?? null,
    }));
  },
});

/** Create an issue in a repo the token can access. */
export const createIssue = action({
  args: {
    repo: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (_ctx, { repo, title, body }) => {
    if (!repo.includes("/")) throw new Error("Choose a repository first.");
    if (title.trim().length < 3)
      throw new Error("Issue title must be at least 3 characters.");
    const res = await githubFetch(`/repos/${encodeURIComponent(repo)}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), body: body?.trim() || undefined }),
    });
    const data = (await res.json()) as {
      number: number;
      html_url: string;
    };
    return { number: data.number, htmlUrl: data.html_url };
  },
});
