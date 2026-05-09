# LLM Wiki Agent Schema

This wiki follows Andrej Karpathy's LLM Wiki pattern: raw sources are immutable, the wiki is maintained by the LLM, and this schema tells the agent how to operate.

## Purpose

Maintain a durable, inspectable knowledge base for the user's repo work, research, architecture decisions, Cloudflare notes, trading safety constraints, and recurring Codex workflows.

## Directory Contract

- `raw/` contains source material. Treat files here as immutable evidence. Do not edit raw sources after ingestion.
- `wiki/` contains maintained Markdown pages. The agent may create and update these files.
- `index.md` is the content-oriented table of contents. Update it after every ingest or major wiki edit.
- `log.md` is append-only chronological history. Add one entry for every ingest, query-to-page, lint pass, or important maintenance change.

## Read Order

1. Read this file.
2. Read `index.md`.
3. Read the relevant pages under `wiki/`.
4. Read raw sources only when verifying or ingesting evidence.

## Ingest Workflow

When adding a source:

1. Put the source under the right `raw/` subfolder.
2. Read the source and identify the claims, decisions, risks, and useful commands.
3. Create or update a source note under `wiki/sources/`.
4. Update relevant concept, repo, decision, or synthesis pages.
5. Update `index.md`.
6. Append an entry to `log.md`.

## Query Workflow

When answering from the wiki:

1. Search `index.md` first.
2. Read only relevant wiki pages.
3. Verify against raw sources or live repo state when the answer depends on current facts.
4. If the answer creates reusable knowledge, add or update a wiki page and append to `log.md`.

## Lint Workflow

Periodically check for:

- stale claims,
- contradictions,
- orphan pages,
- missing links,
- decisions without evidence,
- repo rules that conflict with current `AGENTS.md` files.

## Safety

- Never store API tokens, account tokens, private keys, cookies, or `.env` contents.
- Do not record full account balances unless the user explicitly asks and the file is local-only.
- Trading and execution claims must be verified from current repo files, chart/account state, or command output.
- Repo instructions in the target repo's own `AGENTS.md` override wiki notes when they conflict.
