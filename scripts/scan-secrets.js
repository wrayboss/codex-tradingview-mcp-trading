#!/usr/bin/env node
import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

const SKIP_DIRS = new Set([".git", "node_modules", "state"]);
const SKIP_FILE_NAMES = new Set(["package-lock.json", "trades.csv"]);
const RUNTIME_FILE_PATTERNS = [
  /^\.env$/i,
  /^trades(?:\.legacy-\d{8}-\d{6})?\.csv$/i,
  /^safety-check-log(?:\.(?:archive|legacy)-\d{8}-\d{6})?\.json$/i,
];
const RUNTIME_PATH_PATTERNS = [
  /^state(?:\/|$)/i,
  /^state-test[^/]*(?:\/|$)/i,
];

function toRepoPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function shouldSkipRepoPath(repoPath) {
  const parts = toRepoPath(repoPath).split("/");
  if (parts.some(part => SKIP_DIRS.has(part))) return true;
  if (SKIP_FILE_NAMES.has(parts.at(-1))) return true;
  return false;
}

function isRuntimeArtifactPath(repoPath) {
  const normalized = toRepoPath(repoPath);
  const fileName = normalized.split("/").at(-1);
  return RUNTIME_PATH_PATTERNS.some(pattern => pattern.test(normalized))
    || RUNTIME_FILE_PATTERNS.some(pattern => pattern.test(fileName));
}

function isPlaceholderDerivToken(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return !normalized
    || normalized.includes("your_deriv")
    || normalized.includes("placeholder")
    || normalized.includes("example")
    || normalized === "changeme"
    || normalized === "replace_me";
}

function scanContent(repoPath, content) {
  const findings = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const derivMatch = line.match(/^\s*DERIV_API_TOKEN\s*=\s*(.+?)\s*$/);
    if (derivMatch && !isPlaceholderDerivToken(derivMatch[1])) {
      findings.push({ file: repoPath, line: lineNo, reason: "DERIV_API_TOKEN has a non-placeholder value" });
    }

    if (/\b(api[_-]?token|access[_-]?token|secret|private[_-]?key)\b\s*[:=]\s*['"][A-Za-z0-9_\-.=]{24,}['"]/i.test(line)) {
      if (!/your_|placeholder|example|replace_me|changeme/i.test(line)) {
        findings.push({ file: repoPath, line: lineNo, reason: "token-looking key/value string" });
      }
    }

    if (/\b[A-Za-z0-9_-]{48,}\b/.test(line) && !/sha256|hash|integrity|package-lock|fingerprint/i.test(line)) {
      findings.push({ file: repoPath, line: lineNo, reason: "long token-looking string" });
    }
  });

  return findings;
}

function listTrackedFiles(rootDir) {
  try {
    const output = execFileSync("git", ["ls-files"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.split(/\r?\n/).filter(Boolean).map(toRepoPath);
  } catch {
    return listFilesRecursive(rootDir);
  }
}

function listFilesRecursive(rootDir, currentDir = rootDir) {
  const files = [];
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    const repoPath = toRepoPath(path.relative(rootDir, fullPath));
    if (entry.isDirectory()) {
      if (!shouldSkipRepoPath(repoPath)) files.push(...listFilesRecursive(rootDir, fullPath));
      continue;
    }
    if (entry.isFile()) files.push(repoPath);
  }
  return files;
}

function readTextFile(filePath) {
  const stats = statSync(filePath);
  if (stats.size > 1024 * 1024) return null;
  const buffer = readFileSync(filePath);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

export function scanRepo({ rootDir = process.cwd(), trackedFiles = listTrackedFiles(rootDir) } = {}) {
  const findings = [];
  const scanned = [];

  for (const repoPath of trackedFiles.map(toRepoPath)) {
    if (isRuntimeArtifactPath(repoPath)) {
      findings.push({ file: repoPath, line: 1, reason: "runtime/private artifact is tracked" });
      continue;
    }

    if (shouldSkipRepoPath(repoPath)) continue;

    const absolutePath = path.join(rootDir, repoPath);
    if (!existsSync(absolutePath)) continue;
    const content = readTextFile(absolutePath);
    if (content == null) continue;

    scanned.push(repoPath);
    findings.push(...scanContent(repoPath, content));
  }

  return { ok: findings.length === 0, findings, scannedCount: scanned.length, trackedCount: trackedFiles.length };
}

function main() {
  const result = scanRepo();
  if (result.ok) {
    console.log(`Secret scan passed: ${result.scannedCount} tracked text files checked.`);
    return 0;
  }

  console.error(`Secret scan failed: ${result.findings.length} issue(s) found.`);
  for (const finding of result.findings) {
    console.error(`  ${finding.file}:${finding.line} - ${finding.reason}`);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
