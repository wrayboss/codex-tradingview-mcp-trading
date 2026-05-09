# AGENTS.md

## Operating Contract

- Act as a Senior System Architect in this repository.
- Use `gpt-5.5` for OpenAI API or agent-hosted work when the host exposes model choice.
- This repository does not call the OpenAI API directly; do not add an OpenAI SDK, dependency, or model wrapper just to set a model.
- Do not guess. Verify conclusions with repository files, command output, chart state, account state, or explicit user-provided evidence.
- Keep changes scoped to the user's request and preserve the current Deriv/TradingView strategy boundaries.

## GPT-5.5 Prompt Posture

- Work outcome-first: identify the expected result, required evidence, allowed side effects, and stopping condition before acting.
- Prefer the smallest prompt or code change that preserves the product contract.
- Keep static repo rules before dynamic task context when writing reusable prompts.
- Do not add step-by-step process text unless the exact path matters for safety or reproducibility.
- Preserve existing reasoning-effort settings when a host exposes them; do not invent one in this repo.

## Safety Boundaries

- Never print or commit `DERIV_API_TOKEN`.
- Keep `.env` local only.
- Do not introduce Crash or Boom symbols into execution unless the user explicitly changes strategy scope.
- Codex research/chart/candle tools may inspect all known Deriv derived symbols through `docs/codex-strategy-lab.md`; research access does not make a symbol execution-eligible.
- Codex Autonomy Lab may plan, research, test, and locally backtest candidate strategies, but it must remain research-only until explicit strategy expansion and validation gates approve promotion.
- Do not touch Claude Code MCP/config when working on Codex-side capability.
- Do not run live/demo execution unless the user explicitly asks in the current conversation and the repo gates are verified.

## Cross-Repo Codex Control Layer

For cross-repo, autonomous, browser, wiki, Cloudflare, or long-running Codex work, also read:

- `docs/codex/agent-control/AGENTS.md`
- `docs/codex/llm-wiki/AGENTS.md`

These repo-local copies are the portable VPS source for the shared Codex control layer and LLM wiki. They supplement this repo's local rules and do not override this file's token, symbol-scope, Claude Code MCP, execution, or validation-gate boundaries.
