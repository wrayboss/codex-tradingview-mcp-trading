import { execFileSync } from "child_process";

export const CANONICAL_GITHUB_SLUG = "wrayboss/claude-tradingview-mcp-trading";
export const CANONICAL_ORIGIN_URL = `https://github.com/${CANONICAL_GITHUB_SLUG}.git`;

export function normalizeGithubRemote(remoteUrl) {
  if (!remoteUrl || typeof remoteUrl !== "string") {
    return null;
  }

  const trimmed = remoteUrl.trim();
  const sshMatch = trimmed.match(/^git@github\.com:(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return sshMatch[1].toLowerCase();
  }

  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return httpsMatch[1].toLowerCase();
  }

  return null;
}

export function evaluateGitRemotePreflight({
  originFetchUrl,
  currentBranch,
  upstreamRef,
  canonicalSlug = CANONICAL_GITHUB_SLUG,
}) {
  const issues = [];
  const normalizedOrigin = normalizeGithubRemote(originFetchUrl);
  const expectedOrigin = canonicalSlug.toLowerCase();

  if (!originFetchUrl) {
    issues.push(`Missing origin remote. Expected ${CANONICAL_ORIGIN_URL}.`);
  } else if (!normalizedOrigin) {
    issues.push(`Origin remote is not a recognized GitHub URL: ${originFetchUrl}`);
  } else if (normalizedOrigin !== expectedOrigin) {
    issues.push(
      `Origin remote points to ${normalizedOrigin}, expected ${expectedOrigin}.`
    );
  }

  if (!currentBranch) {
    issues.push("Could not determine the current branch.");
  } else if (currentBranch === "main") {
    issues.push("Current branch is main. Push and PR work must run from a dedicated branch.");
  }

  if (!upstreamRef) {
    issues.push("Current branch has no upstream. Set one before push or PR work.");
  } else {
    const slashIndex = upstreamRef.indexOf("/");
    const upstreamRemote = slashIndex === -1 ? upstreamRef : upstreamRef.slice(0, slashIndex);
    const upstreamBranch = slashIndex === -1 ? "" : upstreamRef.slice(slashIndex + 1);

    if (upstreamRemote !== "origin") {
      issues.push(`Upstream remote is ${upstreamRemote}, expected origin.`);
    }
    if (currentBranch && upstreamBranch !== currentBranch) {
      issues.push(
        `Upstream branch is ${upstreamBranch || "(missing)"}, expected ${currentBranch}.`
      );
    }
  }

  return {
    ok: issues.length === 0,
    canonicalSlug,
    canonicalOriginUrl: CANONICAL_ORIGIN_URL,
    normalizedOrigin,
    currentBranch,
    upstreamRef,
    issues,
  };
}

function safeGit(args, allowFailure = false) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

export function readGitRemotePreflightContext() {
  return {
    originFetchUrl: safeGit(["remote", "get-url", "origin"], true),
    currentBranch: safeGit(["branch", "--show-current"]),
    upstreamRef: safeGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], true),
  };
}

function formatGuidance(result) {
  const branch = result.currentBranch || "<branch-name>";
  return [
    "Suggested fixes:",
    `- Point origin at ${result.canonicalOriginUrl}`,
    `  git remote set-url origin ${result.canonicalOriginUrl}`,
    `- Create or switch to a non-main branch`,
    `  git switch -c codex/<topic>`,
    `- Wire the branch to origin before push or PR work`,
    `  git push -u origin ${branch === "main" ? "codex/<topic>" : branch}`,
  ].join("\n");
}

export function runGitRemotePreflight() {
  const context = readGitRemotePreflightContext();
  const result = evaluateGitRemotePreflight(context);

  console.log("Git remote safety preflight");
  console.log(`- origin: ${context.originFetchUrl || "(missing)"}`);
  console.log(`- branch: ${context.currentBranch || "(unknown)"}`);
  console.log(`- upstream: ${context.upstreamRef || "(missing)"}`);

  if (result.ok) {
    console.log(`PASS: origin is ${CANONICAL_GITHUB_SLUG} and branch wiring is safe for push/PR work.`);
    return;
  }

  console.error("FAIL:");
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  console.error(formatGuidance(result));
  process.exitCode = 1;
}

const directRunPath = process.argv[1]
  ? new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href
  : "";

if (import.meta.url === directRunPath) {
  runGitRemotePreflight();
}
