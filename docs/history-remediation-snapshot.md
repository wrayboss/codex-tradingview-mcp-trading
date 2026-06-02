# History Remediation Snapshot

Date: 2026-06-02

## Repository State Before Remediation

- Repository: `wrayboss/codex-tradingview-mcp-trading`
- Local path: `C:\Users\Administrator\Documents\Codex\2026-06-02\set-a-goal-for-this-task\codex-tradingview-mcp-trading`
- Remote: `https://github.com/wrayboss/codex-tradingview-mcp-trading.git`
- Visibility before remediation: `PRIVATE`
- Default branch: `main`
- Default branch SHA before remediation: `6d2282ba3e6038a54f674e2b61bf753e3c0367c9`
- Current branch at snapshot: `main`
- Git status at snapshot: clean
- Open PR at snapshot: PR #5, `codex/oss-readiness-codex-tradingview-mcp` into `main`

## Local Backup Created Before Rewrite

- Local backup branch: `backup/pre-oss-history-remediation-20260602-1022`
- Local bare mirror backup: `backups/codex-tradingview-mcp-trading-20260602-1022.git`

The backup mirror was created before rewriting so the operation had a recoverable local checkpoint. It must remain private and must not be published.

## Finding

Full-history gitleaks identified one historical private-key finding:

- File: `docs/exchanges/coinbase.md`
- Commit: `ca8e0d11c28f2b6ecdb567df8bfb9a147381814c`
- Rule: `private-key`
- Fingerprint: `ca8e0d11c28f2b6ecdb567df8bfb9a147381814c:docs/exchanges/coinbase.md:private-key:37`

The finding was not provably fake from repository evidence, so it was treated as compromised. Any matching Coinbase API key material must be revoked or rotated before public release.

## Remediation

The current `docs/exchanges/coinbase.md` file was only a legacy placeholder and the current bot does not use Coinbase API keys or Coinbase symbols. The lowest-risk public-safe remediation was to remove that path from all history:

```text
git filter-repo --force --sensitive-data-removal --invert-paths --path docs/exchanges/coinbase.md
```

The rewrite changed 117 commits. The first changed commit was:

```text
ca8e0d11c28f2b6ecdb567df8bfb9a147381814c
```

## Rewritten Branches

The following private remote branches were force-pushed with explicit old-SHA leases after local validation:

- `main`: `6d2282ba3e6038a54f674e2b61bf753e3c0367c9` to `3498747727852208c941d24fecc32ea48295690b`
- `codex/mcp-agent-control-planning-contract`: `b92a276b47f6c05b92d8576b56f848ba1627469b` to `849c5b5052433fdd777f369d5970cced1617426f`
- `codex/mcp-agent-loop-state-contract`: `fa2b3672d3b5fa58532881eec5a8cb6f62f19e80` to `e062b33fa057ab165fcdb35fd8704b477d1a9bb8`
- `codex/mcp-readonly-report-contract`: `54a5f207179bb2e8ede05ffde19a3a86e7c8f27b` to `300f7b47bc4b219cbb291b5b1530f607a1878bff`
- `codex/oss-readiness-codex-tradingview-mcp`: `322fbee89f1d14869f2b79a05d18de3a63d178e5` to `1e96f35a4962ce9bc589400cc9f2568965ea0c4c`

No tags existed on the remote during remediation.

## Post-Remediation Evidence

Local rewritten checkout:

- `gitleaks detect --source . --no-git=false --redact`: no leaks found
- `git log --all -- docs/exchanges/coinbase.md`: no history returned
- Targeted private-key marker search across refs: no matches

Fresh remote clone after force-push:

- `gitleaks detect --source . --no-git=false --redact`: no leaks found
- `git log --all -- docs/exchanges/coinbase.md`: no history returned
- Targeted private-key marker search across refs: no matches
