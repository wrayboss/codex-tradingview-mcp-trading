# Source: Karpathy LLM Wiki Gist

URL: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## What It Says

The gist describes a personal knowledge-base pattern where an LLM maintains a persistent Markdown wiki from immutable raw sources. The schema file tells the agent how to ingest, query, and lint the wiki.

## Why It Matters Here

This workstation has two recurring repos and many safety-sensitive operating rules. A local wiki gives Codex a durable, inspectable source of truth without pushing all control notes into each app repo.

## Local Use

Use this source page as the reference for why the local `llm-wiki/` exists. The exact implementation is intentionally adapted to the user's repo workflow and safety requirements.
