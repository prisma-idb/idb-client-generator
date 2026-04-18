import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MARKER = "<!-- benchmark-regression-report -->";

type CliArgValue = string | boolean;

interface PullRequestEventPayload {
  pull_request?: {
    number?: number;
  };
}

interface IssueComment {
  id: number;
  body: string | null;
}

function parseArgs(argv: string[]): Record<string, CliArgValue> {
  const parsed: Record<string, CliArgValue> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function getStringArg(args: Record<string, CliArgValue>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

async function githubRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T | null> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "prisma-idb-benchmark-bot",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}

async function fetchAllComments(
  owner: string,
  repo: string,
  pullRequestNumber: number,
  token: string
): Promise<IssueComment[]> {
  const all: IssueComment[] = [];
  let path: string | null = `/repos/${owner}/${repo}/issues/${pullRequestNumber}/comments?per_page=100`;

  while (path !== null) {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "prisma-idb-benchmark-bot",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API request failed (${response.status}): ${text}`);
    }

    const page = (await response.json()) as IssueComment[];
    all.push(...page);

    const linkHeader = response.headers.get("Link") ?? "";
    const nextMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
    if (nextMatch) {
      try {
        const parsed = new URL(nextMatch[1]);
        path = parsed.hostname === "api.github.com" ? `${parsed.pathname}${parsed.search}` : null;
      } catch {
        path = null;
      }
    } else {
      path = null;
    }
  }

  return all;
}

async function main() {
  const args = parseArgs(process.argv);
  const bodyFile = getStringArg(args, "body-file");
  if (!bodyFile) {
    throw new Error("Usage: publish-benchmark-pr-comment.ts --body-file <path> [--marker <token>]");
  }

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!token || !repository || !eventPath) {
    process.stdout.write("Skipping PR comment publish: missing GitHub Actions environment variables.\n");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  }

  const event = JSON.parse(await readFile(eventPath, "utf8")) as PullRequestEventPayload;
  const pullRequestNumber = event.pull_request?.number;

  if (!pullRequestNumber) {
    process.stdout.write("Skipping PR comment publish: not a pull_request event.\n");
    return;
  }

  const marker = getStringArg(args, "marker") ?? MARKER;
  const bodyContent = await readFile(resolve(process.cwd(), bodyFile), "utf8");
  const commentBody = `${marker}\n${bodyContent}`;

  const comments = await fetchAllComments(owner, repo, pullRequestNumber, token);

  const existing = comments.find((comment) => typeof comment.body === "string" && comment.body.includes(marker));

  if (existing) {
    await githubRequest<unknown>(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
    process.stdout.write(`Updated benchmark PR comment ${existing.id}.\n`);
    return;
  }

  await githubRequest<unknown>(`/repos/${owner}/${repo}/issues/${pullRequestNumber}/comments`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: commentBody }),
  });

  process.stdout.write("Created benchmark PR comment.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
