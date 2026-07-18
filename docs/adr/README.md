---
title: Architecture Decision Records (ADR)
description: Log of the three biggest architecture decisions for the Automated Video Generator agentic pipeline.
---

# Architecture Decision Records

This directory records the significant, hard-to-reverse decisions behind the agentic
pipeline. Each ADR follows the format: **Context → Decision → Consequences**.

| # | Title | File |
|---|-------|------|
| 001 | Agentic monolith: one pipeline, one orchestrator | [001-agentic-monolith.md](./001-agentic-monolith.md) |
| 002 | Voicebox lifecycle: RAM-gated external GPU backend | [002-voicebox-lifecycle.md](./002-voicebox-lifecycle.md) |
| 003 | Free-stack mandate: zero keys, opt-in bolt-ons | [003-free-stack-mandate.md](./003-free-stack-mandate.md) |

## How to add an ADR

Copy the structure of an existing file: a short status line, the **Context** (what forced
the decision), the **Decision** (what we did), and **Consequences** (trade-offs, what
becomes harder/easier). Number sequentially. Keep it factual and tied to real code paths.

## Status legend

- **Accepted** — decided and implemented.
- **Proposed** — under discussion.
- **Superseded** — replaced by a later ADR (link it).
