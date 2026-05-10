import { existsSync, readFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

export const DEFAULT_DERIV_EA_ROOT = "C:\\deriv_ea";
export const DEFAULT_DERIV_EA_REMOTE = "https://github.com/wrayboss/deriv_ea.git";
export const REQUIRED_DERIV_EA_FILES = [
  "AGENTS.md",
  "docs/skills.md",
  "task.bat",
  "scripts/task.ps1",
  "pipeline_contract.py",
  "strategy_spec.json",
  "pipeline/scripts/paths.json",
];
export const ALLOWED_DERIV_EA_BACKTEST_DRY_SYMBOLS = [
  "BOOM300N",
  "BOOM500",
  "BOOM1000",
  "CRASH300N",
  "CRASH500",
  "CRASH1000",
];

const SECRET_PATTERNS = [
  /\b(DERIV_API_TOKEN|api[_-]?token|password|passwd|pwd|secret|private[_-]?key)\b\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,)\]}#;]+)/gi,
  /\bbearer\s+[A-Za-z0-9._\-+/=]{12,}\b/gi,
  /\b[A-Za-z0-9_/\-+=]{32,}\b/g,
];

function normalizeGithubRemote(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  const ssh = text.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (ssh) return ssh[1].replace(/\.git$/, "");
  const https = text.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/);
  if (https) return https[1].replace(/\.git$/, "");
  return text.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}

function normalizePathForCompare(value) {
  if (!value) return "";
  return path.resolve(String(value)).replace(/[\\/]+$/, "").toLowerCase();
}

function samePath(left, right) {
  return normalizePathForCompare(left) === normalizePathForCompare(right);
}

export function redactBridgeText(value = "") {
  let text = String(value || "");
  text = text.replace(SECRET_PATTERNS[0], (_, key) => `${key}=<redacted>`);
  text = text.replace(SECRET_PATTERNS[1], "Bearer <redacted>");
  text = text.replace(SECRET_PATTERNS[2], "<redacted>");
  return text;
}

function summarizeOutput(value = "") {
  return redactBridgeText(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => line.trimEnd())
    .filter(Boolean)
    .slice(0, 80)
    .join("\n")
    .slice(0, 12000);
}

function baseResult(command, repoRoot) {
  return {
    ok: false,
    repoRoot,
    command,
    exitCode: null,
    warnings: [],
    blockedReason: null,
    stdoutSummary: "",
    stderrSummary: "",
  };
}

function blockedResult(command, repoRoot, blockedReason, warnings = []) {
  return {
    ...baseResult(command, repoRoot),
    repoExists: existsSync(repoRoot),
    warnings,
    blockedReason,
  };
}

function ensureDerivEaRepo(command, repoRoot) {
  if (!existsSync(repoRoot)) {
    return blockedResult(command, repoRoot, `deriv_ea repo not found at canonical path: ${repoRoot}`);
  }
  if (!existsSync(path.join(repoRoot, ".git"))) {
    return blockedResult(command, repoRoot, `deriv_ea path exists but is not a git checkout: ${repoRoot}`);
  }
  return null;
}

function ensureDerivEaCanonicalCheckout(command, repoRoot, canonicalRoot, canonicalRemote) {
  const repoBlocked = ensureDerivEaRepo(command, repoRoot);
  if (repoBlocked) return repoBlocked;

  if (!samePath(repoRoot, canonicalRoot)) {
    return blockedResult(command, repoRoot, `deriv_ea command target is ${repoRoot}; expected canonical path ${canonicalRoot}.`);
  }

  const remote = gitValue(repoRoot, ["config", "--get", "remote.origin.url"]);
  if (normalizeGithubRemote(remote) !== normalizeGithubRemote(canonicalRemote)) {
    return blockedResult(command, repoRoot, `deriv_ea origin remote is ${remote || "<missing>"}; expected ${canonicalRemote}.`);
  }

  const warnings = [];
  const pathsJsonRepoRoot = readPathsJsonRepoRoot(repoRoot, warnings);
  if (!pathsJsonRepoRoot || !samePath(pathsJsonRepoRoot, canonicalRoot)) {
    return blockedResult(
      command,
      repoRoot,
      `deriv_ea pipeline/scripts/paths.json repo_root is ${pathsJsonRepoRoot || "<missing>"}; expected ${canonicalRoot}.`,
      warnings,
    );
  }

  return null;
}

function gitValue(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

function readPathsJsonRepoRoot(repoRoot, warnings) {
  const pathsJson = path.join(repoRoot, "pipeline", "scripts", "paths.json");
  if (!existsSync(pathsJson)) {
    warnings.push("Missing pipeline/scripts/paths.json; cannot verify deriv_ea repo_root contract.");
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(pathsJson, "utf8").replace(/^\uFEFF/, ""));
    return typeof parsed.repo_root === "string" ? parsed.repo_root : null;
  } catch (error) {
    warnings.push(`Could not parse pipeline/scripts/paths.json: ${error.message}`);
    return null;
  }
}

function parseAheadBehind(repoRoot, upstream, warnings) {
  if (!upstream) return { ahead: null, behind: null };
  const raw = gitValue(repoRoot, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]);
  if (!raw) {
    warnings.push(`Could not compute ahead/behind against ${upstream}.`);
    return { ahead: null, behind: null };
  }
  const [aheadRaw, behindRaw] = raw.split(/\s+/);
  const ahead = Number(aheadRaw);
  const behind = Number(behindRaw);
  return {
    ahead: Number.isFinite(ahead) ? ahead : null,
    behind: Number.isFinite(behind) ? behind : null,
  };
}

export function getDerivEaStatus({
  repoRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRemote = DEFAULT_DERIV_EA_REMOTE,
} = {}) {
  const command = "status";
  const blocked = ensureDerivEaRepo(command, repoRoot);
  if (blocked) return blocked;

  const warnings = [];
  const branch = gitValue(repoRoot, ["branch", "--show-current"]);
  const remote = gitValue(repoRoot, ["config", "--get", "remote.origin.url"]);
  const latestCommit = gitValue(repoRoot, ["log", "-1", "--format=%h %s"]);
  const upstream = gitValue(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream) warnings.push("No upstream branch is configured for deriv_ea.");
  const { ahead, behind } = parseAheadBehind(repoRoot, upstream, warnings);
  const workingTreeStatus = gitValue(repoRoot, ["status", "--short"]);
  const pathsJsonRepoRoot = readPathsJsonRepoRoot(repoRoot, warnings);
  const pathsJsonRepoRootMatchesCanonical = Boolean(pathsJsonRepoRoot && samePath(pathsJsonRepoRoot, canonicalRoot));
  const canonicalRemoteMatches = normalizeGithubRemote(remote) === normalizeGithubRemote(canonicalRemote);

  if (!canonicalRemoteMatches) warnings.push(`origin remote is ${remote || "<missing>"}; expected ${canonicalRemote}.`);
  if (!pathsJsonRepoRootMatchesCanonical) {
    warnings.push(`pipeline/scripts/paths.json repo_root is ${pathsJsonRepoRoot || "<missing>"}; expected ${canonicalRoot}.`);
  }

  return {
    ...baseResult(command, repoRoot),
    ok: Boolean(branch && latestCommit && canonicalRemoteMatches && pathsJsonRepoRootMatchesCanonical),
    exitCode: 0,
    repoExists: true,
    branch,
    remote,
    latestCommit,
    workingTreeClean: !workingTreeStatus,
    workingTreeDirty: Boolean(workingTreeStatus),
    upstream: upstream || null,
    ahead,
    behind,
    canonicalRemote,
    canonicalRemoteMatches,
    pathsJsonRepoRoot,
    pathsJsonRepoRootMatchesCanonical,
    warnings,
  };
}

export function getDerivEaDoctor({ repoRoot = DEFAULT_DERIV_EA_ROOT } = {}) {
  const command = "doctor";
  if (!existsSync(repoRoot)) {
    return blockedResult(command, repoRoot, `deriv_ea repo not found at canonical path: ${repoRoot}`);
  }

  const warnings = [];
  const requiredFiles = REQUIRED_DERIV_EA_FILES.map(file => ({
    file,
    exists: existsSync(path.join(repoRoot, file)),
  }));
  const missingRequiredFiles = requiredFiles.filter(item => !item.exists).map(item => item.file);
  const agentsPath = path.join(repoRoot, "AGENTS.md");
  const legacySkillsPath = path.join(repoRoot, "AGENTS", "skills.md");
  const actualSkillsPath = path.join(repoRoot, "docs", "skills.md");
  if (existsSync(agentsPath)) {
    const agentsText = readFileSync(agentsPath, "utf8");
    if (agentsText.includes("AGENTS/skills.md") && !existsSync(legacySkillsPath) && existsSync(actualSkillsPath)) {
      warnings.push("AGENTS.md references AGENTS/skills.md, but the checked-in skills guide is docs/skills.md.");
    }
  }

  return {
    ...baseResult(command, repoRoot),
    ok: missingRequiredFiles.length === 0,
    exitCode: 0,
    repoExists: true,
    requiredFiles,
    missingRequiredFiles,
    warnings,
    blockedReason: missingRequiredFiles.length ? "Missing required deriv_ea operating files." : null,
  };
}

function defaultRunner(command, { cwd }) {
  const result = spawnSync(command.executable, command.args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function runCommandSequence({
  repoRoot,
  canonicalRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRemote = DEFAULT_DERIV_EA_REMOTE,
  command,
  commandSpecs,
  runner = defaultRunner,
}) {
  const blocked = ensureDerivEaCanonicalCheckout(command, repoRoot, canonicalRoot, canonicalRemote);
  if (blocked) return blocked;

  const commandResults = [];
  for (const spec of commandSpecs) {
    const result = runner(spec, { cwd: repoRoot });
    const commandResult = {
      command: spec.display,
      exitCode: result.exitCode,
      stdoutSummary: summarizeOutput(result.stdout),
      stderrSummary: summarizeOutput(result.stderr),
    };
    commandResults.push(commandResult);
    if (result.exitCode !== 0) break;
  }

  const firstFailure = commandResults.find(item => item.exitCode !== 0);
  return {
    ...baseResult(command, repoRoot),
    ok: !firstFailure,
    exitCode: firstFailure ? firstFailure.exitCode : 0,
    repoExists: true,
    commandResults,
    stdoutSummary: commandResults.map(item => item.stdoutSummary).filter(Boolean).join("\n"),
    stderrSummary: commandResults.map(item => item.stderrSummary).filter(Boolean).join("\n"),
    blockedReason: firstFailure ? `deriv_ea ${firstFailure.command} failed with exit code ${firstFailure.exitCode}.` : null,
  };
}

function commandSpec(display, executable, args) {
  return { display, executable, args };
}

function taskBatSpec(display) {
  return commandSpec(display, "cmd.exe", ["/d", "/s", "/c", display]);
}

export function runDerivEaCheck({
  repoRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRemote = DEFAULT_DERIV_EA_REMOTE,
  runner = defaultRunner,
} = {}) {
  return runCommandSequence({
    repoRoot,
    canonicalRoot,
    canonicalRemote,
    command: "check",
    runner,
    commandSpecs: [
      commandSpec("python scripts\\checks\\secrets_scan.py --all", "python", ["scripts\\checks\\secrets_scan.py", "--all"]),
      taskBatSpec(".\\task.bat precommit"),
    ],
  });
}

export function runDerivEaQuickCheck({
  repoRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRemote = DEFAULT_DERIV_EA_REMOTE,
  runner = defaultRunner,
} = {}) {
  return runCommandSequence({
    repoRoot,
    canonicalRoot,
    canonicalRemote,
    command: "quick-check",
    runner,
    commandSpecs: [
      taskBatSpec(".\\task.bat quick-check"),
    ],
  });
}

export function runDerivEaBacktestDry({
  repoRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRoot = DEFAULT_DERIV_EA_ROOT,
  canonicalRemote = DEFAULT_DERIV_EA_REMOTE,
  symbol,
  runner = defaultRunner,
} = {}) {
  const command = "backtest-dry";
  if (!ALLOWED_DERIV_EA_BACKTEST_DRY_SYMBOLS.includes(symbol)) {
    return blockedResult(
      command,
      repoRoot,
      `Symbol ${symbol || "<missing>"} is not allowlisted for deriv_ea backtest-dry. Allowed: ${ALLOWED_DERIV_EA_BACKTEST_DRY_SYMBOLS.join(", ")}.`,
    );
  }
  return runCommandSequence({
    repoRoot,
    canonicalRoot,
    canonicalRemote,
    command,
    runner,
    commandSpecs: [
      taskBatSpec(`.\\task.bat backtest-dry -Symbol ${symbol}`),
    ],
  });
}

export function runDerivEaBridgeCommand({ command = "status", args = {}, repoRoot = DEFAULT_DERIV_EA_ROOT } = {}) {
  switch (command) {
    case "status":
      return getDerivEaStatus({ repoRoot });
    case "doctor":
      return getDerivEaDoctor({ repoRoot });
    case "check":
      return runDerivEaCheck({ repoRoot });
    case "quick-check":
      return runDerivEaQuickCheck({ repoRoot });
    case "backtest-dry":
      return runDerivEaBacktestDry({ repoRoot, symbol: args.symbol });
    default:
      return blockedResult(command, repoRoot, `deriv_ea command "${command}" is not allowlisted.`);
  }
}

export function parseDerivEaCliArgs(argv = []) {
  const [command = "status", ...rest] = argv;
  const args = {};
  for (let index = 0; index < rest.length; index++) {
    const item = rest[index];
    if (item === "--symbol") {
      args.symbol = rest[index + 1];
      index++;
    } else if (item.startsWith("--symbol=")) {
      args.symbol = item.slice("--symbol=".length);
    }
  }
  return { command, args };
}
