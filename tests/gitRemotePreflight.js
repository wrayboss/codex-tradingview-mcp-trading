import {
  CANONICAL_GITHUB_SLUG,
  normalizeGithubRemote,
  evaluateGitRemotePreflight,
} from "../scripts/git-remote-preflight.js";

export const gitRemotePreflightTests = [
  {
    name: "normalizes canonical https remote",
    async run(eq) {
      eq(
        "https remote normalized",
        normalizeGithubRemote("https://github.com/wrayboss/claude-tradingview-mcp-trading.git"),
        CANONICAL_GITHUB_SLUG
      );
    },
  },
  {
    name: "normalizes canonical ssh remote",
    async run(eq) {
      eq(
        "ssh remote normalized",
        normalizeGithubRemote("git@github.com:wrayboss/claude-tradingview-mcp-trading.git"),
        CANONICAL_GITHUB_SLUG
      );
    },
  },
  {
    name: "passes when origin and upstream are wired safely",
    async run(eq) {
      const result = evaluateGitRemotePreflight({
        originFetchUrl: "https://github.com/wrayboss/claude-tradingview-mcp-trading.git",
        currentBranch: "codex/remote-preflight",
        upstreamRef: "origin/codex/remote-preflight",
      });
      eq("result ok", result.ok, true);
      eq("no issues", result.issues.length, 0);
    },
  },
  {
    name: "fails when origin is not canonical",
    async run(eq, truthy) {
      const result = evaluateGitRemotePreflight({
        originFetchUrl: "https://github.com/jackson-video-resources/claude-tradingview-mcp-trading",
        currentBranch: "codex/remote-preflight",
        upstreamRef: "origin/codex/remote-preflight",
      });
      eq("result fails", result.ok, false);
      truthy(
        "origin mismatch reported",
        result.issues.some(issue => issue.includes("expected wrayboss/claude-tradingview-mcp-trading"))
      );
    },
  },
  {
    name: "fails closed on main branch",
    async run(eq, truthy) {
      const result = evaluateGitRemotePreflight({
        originFetchUrl: "https://github.com/wrayboss/claude-tradingview-mcp-trading.git",
        currentBranch: "main",
        upstreamRef: "origin/main",
      });
      eq("result fails", result.ok, false);
      truthy(
        "main branch issue reported",
        result.issues.some(issue => issue.includes("Current branch is main"))
      );
    },
  },
  {
    name: "fails when upstream is missing",
    async run(eq, truthy) {
      const result = evaluateGitRemotePreflight({
        originFetchUrl: "https://github.com/wrayboss/claude-tradingview-mcp-trading.git",
        currentBranch: "codex/remote-preflight",
        upstreamRef: "",
      });
      eq("result fails", result.ok, false);
      truthy(
        "missing upstream reported",
        result.issues.some(issue => issue.includes("no upstream"))
      );
    },
  },
  {
    name: "fails when upstream branch does not match current branch",
    async run(eq, truthy) {
      const result = evaluateGitRemotePreflight({
        originFetchUrl: "https://github.com/wrayboss/claude-tradingview-mcp-trading.git",
        currentBranch: "codex/remote-preflight",
        upstreamRef: "origin/codex/other-branch",
      });
      eq("result fails", result.ok, false);
      truthy(
        "upstream mismatch reported",
        result.issues.some(issue => issue.includes("expected codex/remote-preflight"))
      );
    },
  },
];
