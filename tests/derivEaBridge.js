import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createCodexTools } from "../codex-mcp/tools.js";
import {
  DEFAULT_DERIV_EA_REMOTE,
  getDerivEaDoctor,
  getDerivEaStatus,
  redactBridgeText,
  runDerivEaBacktestDry,
  runDerivEaBridgeCommand,
  runDerivEaCheck,
} from "../src/derivEaBridge.js";

function prepareDir(name) {
  const dir = path.resolve(`state-test-${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeRequiredDerivEaFiles(root, { agentsText = "Before work, read AGENTS/skills.md." } = {}) {
  const dirs = [
    "docs",
    "scripts",
    "pipeline/scripts",
  ];
  for (const dir of dirs) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, "AGENTS.md"), agentsText);
  writeFileSync(path.join(root, "docs/skills.md"), "# Skills\n");
  writeFileSync(path.join(root, "task.bat"), "@echo off\r\n");
  writeFileSync(path.join(root, "scripts/task.ps1"), "Write-Output task\r\n");
  writeFileSync(path.join(root, "pipeline_contract.py"), "SYMBOLS = ()\n");
  writeFileSync(path.join(root, "strategy_spec.json"), "{}\n");
  writeFileSync(path.join(root, "pipeline/scripts/paths.json"), JSON.stringify({ repo_root: root }, null, 2));
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function prepareGitRepo(root) {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "codex@example.invalid"]);
  git(root, ["config", "user.name", "Codex Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial"]);
  git(root, ["remote", "add", "origin", DEFAULT_DERIV_EA_REMOTE]);
  git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(root, ["branch", "--set-upstream-to=origin/main", "main"]);
}

export const derivEaBridgeTests = [
  {
    name: "missing canonical repo fails closed",
    async run(eq, truthy) {
      const missing = path.resolve("state-test-missing-deriv-ea");
      rmSync(missing, { recursive: true, force: true });

      const status = getDerivEaStatus({ repoRoot: missing });
      eq("status fails", status.ok, false);
      eq("status reports missing repo", status.repoExists, false);
      truthy("status returns blocked reason", status.blockedReason.includes("not found"));

      const doctor = getDerivEaDoctor({ repoRoot: missing });
      eq("doctor fails", doctor.ok, false);
      truthy("doctor blocks instead of using another path", doctor.blockedReason.includes(missing));

      const check = runDerivEaCheck({ repoRoot: missing });
      eq("check fails", check.ok, false);
      truthy("check blocks instead of using another path", check.blockedReason.includes(missing));
    },
  },
  {
    name: "doctor checks required files and reports skill path mismatch",
    async run(eq, truthy) {
      const root = prepareDir("deriv-ea-doctor");
      try {
        writeRequiredDerivEaFiles(root);
        const result = getDerivEaDoctor({ repoRoot: root });
        eq("doctor passes with required files present", result.ok, true);
        eq("all required files are checked", result.requiredFiles.length, 7);
        eq("no required files are missing", result.missingRequiredFiles.length, 0);
        truthy(
          "AGENTS skills mismatch warning is surfaced",
          result.warnings.some(warning => warning.includes("AGENTS/skills.md") && warning.includes("docs/skills.md")),
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "status parses git, remote, dirty state, upstream, and paths contract",
    async run(eq, truthy) {
      const root = prepareDir("deriv-ea-status");
      try {
        writeRequiredDerivEaFiles(root);
        prepareGitRepo(root);
        writeFileSync(path.join(root, "scratch.txt"), "dirty\n");

        const result = getDerivEaStatus({ repoRoot: root, canonicalRoot: root });
        eq("status ok", result.ok, true);
        eq("repo exists", result.repoExists, true);
        eq("branch parsed", result.branch, "main");
        eq("remote parsed", result.remote, DEFAULT_DERIV_EA_REMOTE);
        truthy("latest commit includes short sha and subject", /^([0-9a-f]{7,}) initial$/.test(result.latestCommit));
        eq("working tree reports dirty", result.workingTreeDirty, true);
        eq("upstream parsed", result.upstream, "origin/main");
        eq("ahead count parsed", result.ahead, 0);
        eq("behind count parsed", result.behind, 0);
        eq("canonical remote matches", result.canonicalRemoteMatches, true);
        eq("paths repo_root parsed", result.pathsJsonRepoRoot, root);
        eq("paths repo_root matches canonical", result.pathsJsonRepoRootMatchesCanonical, true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "check runs exact allowlisted commands",
    async run(eq) {
      const root = prepareDir("deriv-ea-check");
      const commands = [];
      try {
        writeRequiredDerivEaFiles(root);
        prepareGitRepo(root);
        const result = runDerivEaCheck({
          repoRoot: root,
          canonicalRoot: root,
          runner: (command) => {
            commands.push(command.display);
            return { exitCode: 0, stdout: "ok", stderr: "" };
          },
        });
        eq("check ok", result.ok, true);
        eq("first command exact", commands[0], "python scripts\\checks\\secrets_scan.py --all");
        eq("second command exact", commands[1], ".\\task.bat precommit");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "wrong remote blocks check before command runner",
    async run(eq, truthy) {
      const root = prepareDir("deriv-ea-wrong-remote");
      const commands = [];
      try {
        writeRequiredDerivEaFiles(root);
        prepareGitRepo(root);
        git(root, ["remote", "set-url", "origin", "https://github.com/wrayboss/not_deriv_ea.git"]);
        const result = runDerivEaCheck({
          repoRoot: root,
          canonicalRoot: root,
          runner: (command) => {
            commands.push(command.display);
            return { exitCode: 0, stdout: "should not run", stderr: "" };
          },
        });
        eq("wrong remote fails closed", result.ok, false);
        eq("runner is not called", commands.length, 0);
        truthy("blocked reason names remote mismatch", result.blockedReason.includes("origin remote"));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "wrong paths repo root blocks backtest-dry before command runner",
    async run(eq, truthy) {
      const root = prepareDir("deriv-ea-wrong-paths-root");
      const commands = [];
      try {
        writeRequiredDerivEaFiles(root);
        writeFileSync(
          path.join(root, "pipeline", "scripts", "paths.json"),
          JSON.stringify({ repo_root: path.join(root, "wrong") }, null, 2),
        );
        prepareGitRepo(root);
        const result = runDerivEaBacktestDry({
          repoRoot: root,
          canonicalRoot: root,
          symbol: "CRASH1000",
          runner: (command) => {
            commands.push(command.display);
            return { exitCode: 0, stdout: "should not run", stderr: "" };
          },
        });
        eq("wrong paths repo root fails closed", result.ok, false);
        eq("runner is not called", commands.length, 0);
        truthy("blocked reason names paths root mismatch", result.blockedReason.includes("paths.json repo_root"));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "canonical checkout passes through to allowlisted backtest-dry runner",
    async run(eq) {
      const root = prepareDir("deriv-ea-canonical-backtest");
      const commands = [];
      try {
        writeRequiredDerivEaFiles(root);
        prepareGitRepo(root);
        const result = runDerivEaBacktestDry({
          repoRoot: root,
          canonicalRoot: root,
          symbol: "CRASH1000",
          runner: (command) => {
            commands.push(command.display);
            return { exitCode: 0, stdout: "ok", stderr: "" };
          },
        });
        eq("canonical checkout passes", result.ok, true);
        eq("allowlisted backtest command runs", commands[0], ".\\task.bat backtest-dry -Symbol CRASH1000");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "invalid backtest-dry symbols are rejected",
    async run(eq, truthy) {
      const root = prepareDir("deriv-ea-invalid-symbol");
      try {
        writeRequiredDerivEaFiles(root);
        const result = runDerivEaBacktestDry({
          repoRoot: root,
          symbol: "VOLATILITY_75",
          runner: () => ({ exitCode: 0, stdout: "should not run", stderr: "" }),
        });
        eq("invalid symbol fails", result.ok, false);
        truthy("invalid symbol blocker is explicit", result.blockedReason.includes("not allowlisted"));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "arbitrary bridge commands are rejected",
    async run(eq, truthy) {
      const result = runDerivEaBridgeCommand({ command: "mt5_send_order" });
      eq("arbitrary command rejected", result.ok, false);
      truthy("blocked reason names allowlist", result.blockedReason.includes("allowlisted"));
    },
  },
  {
    name: "secret-like output is redacted",
    async run(eq) {
      const tokenValue = "abc123" + "4567890abcdef";
      const passwordValue = "super" + "secret12345";
      const bearerValue = "abcdef" + "1234567890abcdef";
      const redacted = redactBridgeText(`DERIV_API_TOKEN=${tokenValue} password="${passwordValue}" Bearer ${bearerValue}`);
      eq("token value redacted", redacted.includes(tokenValue), false);
      eq("password value redacted", redacted.includes(passwordValue), false);
      eq("bearer value redacted", redacted.includes(`Bearer ${bearerValue}`), false);
    },
  },
  {
    name: "MCP exposes read-only deriv_ea bridge tools",
    async run(eq, truthy) {
      const tools = createCodexTools();
      const names = tools.list().map(tool => tool.name);
      truthy("status tool listed", names.includes("deriv_ea_status"));
      truthy("doctor tool listed", names.includes("deriv_ea_doctor"));
      truthy("check tool listed", names.includes("deriv_ea_check"));
      truthy("quick-check tool listed", names.includes("deriv_ea_quick_check"));
      truthy("backtest-dry tool listed", names.includes("deriv_ea_backtest_dry"));
      eq("no MT5 send-order tool exposed", names.includes("mt5_send_order"), false);

      const invalid = await tools.call("deriv_ea_backtest_dry", { symbol: "VOLATILITY_75" });
      eq("invalid symbol remains blocked through MCP", invalid.ok, false);
      truthy("MCP invalid symbol blocker names allowlist", invalid.blockedReason.includes("allowlisted"));
    },
  },
];
