# pokemon-data

ポケモンマスターデータの正本レイヤー。`pokemon-distribution-app` / `distribution-scraper` /
`pokemon-ribbon-tracker` / `pokebros-blog-manager` / `pokebros-content-hub` / `pokebros-tools`
など関連リポジトリが参照する。

## 構成

- `pokemon/all.json` — ポケモンマスターデータ（種族・フォーム）の正本
- `pokemon/history.json` — 種族・フォームの時系列の事実（過去タイプ・フォーム登場ソフト）の正本（手書き。fetch系スクリプトは読まない・書かない。ADR 0016）
- `games/` — ゲームタイトル・グループ・世代定義の正本
- `abilities/` — 特性データの正本
- `mappings/` — リボン・あかし・ボール・性格等の英日マッピング正本
- `ribbons/catalog.json` — リボン・あかし完全カタログの正本（`mappings/ribbons.json` は EN→JA 対訳（配布データ用）で catalog のサブセット。消費者: ribbon-tracker `scripts/generate-ribbons.mjs`）
- `distributions/*.json` — 配信ポケモンデータの正本（L2）
- `build/pokemon.json` — 上記を join した成果物（L3・コミット方式）
- `poco-a-pokemon/events.json` / `raids/tera-raids.json` — イベント期限表（手書き）。`distributions/` とは別物

詳細な設計・データフロー・スキーマは `DEVELOPMENT_NOTES.md` が正本。まずそちらを見る。

## 主要コマンド

- `uv run scripts/fetch-pokemon.py` — PokeAPIからマスターデータ取得
- `npm run build`（= `node scripts/build-distributions.mjs`） — `build/pokemon.json` 生成
- `npm run validate` — マスター＋配信正本の健全性チェック

## 編集ルール

- `distributions/*.json` が配信データの正本。他リポジトリの配信データを直接編集しない
- `build/` は生成物。手で編集せず、ソース側を直してから再生成する
- `mappings/` を参照する他リポジトリ（distribution-scraper 等）は symlink 経由。実体はここだけ
- 期限表（`poco-a-pokemon/` `raids/`）を更新したら `checkedUntil` も先へ進める。
  進めないと morning brief が毎朝「表が期限切れ」と鳴り続ける（詳細は `DEVELOPMENT_NOTES.md`）

---

## Codex

This file is the shared source of truth for Claude Code and Codex. Claude Code reads it directly;
do not add a `CLAUDE.md` (it would make Claude Code read that instead of this file).

### Before working

1. Read this file completely.
2. Treat every standalone `@path` line in this file as a required file reference and read that
   file completely before the related work. The `@` syntax is a Claude Code import and is not a
   Codex import.
3. If `../pokebros-content-hub/AGENTS.md` exists, read it before cross-repository work. Follow its
   shared rules for repository ownership, concurrent sessions, handoff, publication, and deploys.
4. Use the validation commands documented in this file for the files changed.

### Concurrent sessions and handoff

- One checkout has one writing session. Concurrent writers use separate checkouts or worktrees and
  separate branches.
- Split concurrent work by phase or repository. Read-only review may run in parallel.
- At a handoff, commit the exact paths, push, and have the receiving environment pull before it
  edits. Do not use chat history or ignored files as the handoff record.
- Stage explicit paths only. Never include changes from another active session in a commit.
- Keep edits and Git operations inside this repository unless the hub workflow explicitly assigns
  cross-repository work.
