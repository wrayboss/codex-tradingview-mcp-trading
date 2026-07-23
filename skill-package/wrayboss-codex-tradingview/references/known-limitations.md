# Known limitations

## Connector requirement

This skill does not create a native ChatGPT-to-VPS MCP connector. It depends on Remote Desktop Commander being connected and authorized to operate the Windows VPS.

## Runtime transfer

Uploading the ZIP to ChatGPT does not by itself prove the packaged scripts are installed on the VPS. The agent must verify or install the fixed runtime cache using exact packaged files and hashes.

## ChatGPT uploader acceptance

The ZIP is structurally validated against the Agent Skills format and cleanly extracted in testing. Actual acceptance by ChatGPT's upload scanner remains `NOT VERIFIED` until the user uploads it and the platform scan completes.

## Future registry changes

The verified revision exposes exactly 114 unique tools. A future repository update may add, remove, or rename tools. The skill deliberately blocks mutation on a count or required-tool mismatch until the manifest is reviewed and regenerated.

## Discovery-only capabilities

A listed tool is not automatically fully exercised. `tests/capability-manifest.json` distinguishes fully exercised, read-only exercised, discovery-only, failed, and untested capabilities.

## UI variability

TradingView Desktop UI selectors and panels may change after application updates. Semantic chart API tools are more stable than raw UI actions, but UI-driven Pine, indicator, panel, and Strategy Tester workflows can still require revalidation.

## Local login state

The skill does not package TradingView cookies, profiles, credentials, or account state. The local application must already be logged in when the requested feature requires account access.

## Financial execution

The verified MCP includes research, dry-run, safety, and Deriv EA report tools. It does not expose an MT5 send-order tool. The skill never uses shell commands or bot scripts to bypass that boundary.

## Paid session disruption

Relaunching TradingView can interrupt the active logged-in session. A running process without CDP is not terminated without explicit approval.

## Behavioral skill testing

During package construction, fresh-agent RED/GREEN pressure tests were blocked by the local Codex CLI usage limit. Deterministic script tests and live MCP tests were completed, but cross-agent behavioral compliance is recorded as `NOT VERIFIED`, not passed.

## No universal guarantee

No instruction package can guarantee perfect behavior from every future model or host. This skill reduces ambiguity through identity locks, executable preflight checks, evidence contracts, and fail-closed rules. Future agents must still have the required connector and obey the loaded skill.
