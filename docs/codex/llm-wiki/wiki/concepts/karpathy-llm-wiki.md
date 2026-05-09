# Karpathy LLM Wiki Pattern

Source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## Summary

The LLM Wiki pattern uses three layers:

- immutable raw sources,
- a maintained Markdown wiki,
- an agent schema such as `AGENTS.md` that defines how the LLM should ingest, query, and lint the wiki.

The key idea is that knowledge should compound. Instead of re-reading scattered sources on every question, the LLM maintains structured pages, cross-references, contradictions, and synthesis over time.

## Local Adaptation

For this workstation, the wiki is used to preserve:

- repo operating rules,
- architecture decisions,
- Cloudflare research,
- trading safety gates,
- PR and worktree workflows,
- reusable validation evidence.

## Operating Rule

Use the wiki as a navigation layer, not as a replacement for live verification. If a claim depends on current repo state, run the command or inspect the current file before concluding.
