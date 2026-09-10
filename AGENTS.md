# Codex entrypoint

This file is the durable entrypoint for Codex. The repository-specific source of truth remains
`CLAUDE.md`; do not duplicate those rules here.

## Before working

1. Read `CLAUDE.md` completely.
2. Treat every standalone `@path` line in `CLAUDE.md` as a required file reference and read that
   file completely before the related work. The `@` syntax is a Claude Code import and is not a
   Codex import.
3. If `../pokebros-content-hub/AGENTS.md` exists, read it before cross-repository work. Follow its
   shared rules for repository ownership, concurrent sessions, handoff, publication, and deploys.
4. Use the validation commands documented in this repository's `CLAUDE.md` for the files changed.

## Concurrent sessions and handoff

- One checkout has one writing session. Concurrent writers use separate checkouts or worktrees and
  separate branches.
- Split concurrent work by phase or repository. Read-only review may run in parallel.
- At a handoff, commit the exact paths, push, and have the receiving environment pull before it
  edits. Do not use chat history or ignored files as the handoff record.
- Stage explicit paths only. Never include changes from another active session in a commit.
- Keep edits and Git operations inside this repository unless the hub workflow explicitly assigns
  cross-repository work.
