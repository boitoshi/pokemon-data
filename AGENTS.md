# pokemon-data

ポケモンマスターデータの正本レイヤー。`distribution-scraper` / `pokemon-ribbon-tracker` /
`pokebros-blog-manager` / `pokebros-content-hub` / `pokebros-tools` など関連リポジトリが参照する。
（`pokemon-distribution-app` は 2026-10-13 にアーカイブ済み・読み取り専用で、もう参照しない。配信検索は pokebros-tools の `data.pokebros.net/distribution/` に一本化。content-hub ADR 0017・0020）

## 構成

- `pokemon/all.json` — ポケモンマスターデータ（種族・フォーム）の正本
- `pokemon/history.json` — 種族・フォームの時系列の事実（過去タイプ・フォーム登場ソフト）の正本（手書き。fetch系スクリプトは読まない・書かない。ADR 0016）
- `pokemon/game-compatibility.json` — 作品（ゲームグループ）に入れる種族の対応（全国図鑑番号）。`scripts/validate-game-compatibility.mjs` が検証し、ribbon-tracker `scripts/generate-game-compatibility.mjs` が読む
- `forms/special-forms.json` — 特殊フォーム（メガ・リージョン・キョダイマックス等）の定義の正本（手書き。`scripts/fetch-forms.py` の入力で、`pokemon/all.json` の forms はここから生成。ADR 0012）
- `games/` — ゲームタイトル・グループ・世代定義の正本
- `games/progression-gates.json` — 交換・転送・コンテスト施設の進行度解放条件（手書き。`scripts/validate-game-compatibility.mjs` が検証）
- `abilities/` — 特性データの正本
- `mappings/` — リボン・あかし・ボール・性格等の英日マッピング正本
- `mappings/form-image-suffixes.json` — 姿名 → 画像ファイル名の ASCII サフィックス（日本語→ASCII。content-hub ADR 0020）
- `ribbons/catalog.json` — リボン・あかし完全カタログの正本（`mappings/ribbons.json` は EN→JA 対訳（配布データ用）で catalog のサブセット。消費者: ribbon-tracker `scripts/generate-ribbons.mjs`）
- `services/all.json` — 通信サービス（WFC・PGL・ポケモンバンク等）の終了日時の正本（手書き）。catalog の `methods[].requiresServices` と ribbon-tracker の転送ルートが参照する。状態は持たず日付から求める
- `distributions/*.json` — 配信ポケモンデータの正本（L2）
- `trainers/` — ジムリーダー・四天王の名簿と手持ちの正本（詳細は `trainers/README.md`）
- `tcg/releases.json` — ポケモンカードゲームの発売スケジュール正本（手書き。content-hub `scripts/generate_pokeca_releases_html.py` が読む）
- `audits/` — 確認記録（証拠記録。現在は第3世代配信の受け取り経路。配信正本は変更しない）
- `schemas/data-contracts.json` — 主要データファイルの必須キー・最小件数の契約（`scripts/validate-data.mjs` が読む）
- `build/pokemon.json` — 上記を join した成果物（L3・コミット方式）
- `build/abbreviations.json` — ゲーム名・配布方法の略称対照表（L3・コミット方式。`scripts/build-abbreviations.mjs` で生成。content-hub `scripts/sync-distribution-apps.py` が読む）
- `build/meta.json` — `build/pokemon.json` のサイドカー（件数等。`scripts/build-distributions.mjs` が生成）
- `poco-a-pokemon/events.json` / `raids/tera-raids.json` — イベント期限表（手書き）。`distributions/` とは別物

詳細な設計・データフロー・スキーマは `DEVELOPMENT_NOTES.md` が正本。まずそちらを見る。

## 主要コマンド

- `uv run scripts/fetch-pokemon.py` — PokeAPIからマスターデータ取得
- `npm run build`（= `node scripts/build-distributions.mjs && node scripts/build-abbreviations.mjs`） — `build/pokemon.json` と `build/abbreviations.json` 生成
- `npm run validate` — マスター＋配信正本の健全性チェック

## 編集ルール

- `distributions/*.json` が配信データの正本。他リポジトリの配信データを直接編集しない
- `build/` は生成物。手で編集せず、ソース側を直してから再生成する
- **統合・削除した配信の `id` は使い回さない**（備考の「（id: …）」参照や公開ページの URL が別の配信を指してしまう。2026-09-28 に 09114 で実例。`npm run validate` が参照先のポケモン違いを止める）
- `notes` は読者向けの備考だけ。確認日は `verified`、出典URLは `references`、統合などの作業メモは git 履歴に残す
- catalog の route には `timing`（必須）と、ソフトで取り方が違うときだけ `methods[]`（`availability` / `requiresServices` 等）を書く。
  出典は `references`、資料を読んで確認した日は `checkedAt`、`verified` は実機（公式画像）で確かめたときだけ（詳細は `DEVELOPMENT_NOTES.md`。
  決定の経緯は `../pokebros-content-hub/docs/adr/0018-ribbon-availability-services-and-ports.md`）
- 移植版（`portOf` を持つ title）は catalog に明示的に書く（生成時に展開しない）。移植元を含む route は、移植版を `games` に入れるか
  `excludedPorts` に書くかを決める。決めていないと `npm run validate:ribbons` が一覧を出して止める
- `mappings/` を参照する他リポジトリ（distribution-scraper 等）は symlink 経由。実体はここだけ
- 期限表（`poco-a-pokemon/` `raids/`）を更新したら `checkedUntil` も先へ進める。
  morning brief の期限切れ通知はテラレイド表が対象。ぽこあ表は期限切れ通知の対象外で、
  `checkedAt` からの確認間隔で通知する（設定は `../morning-status/config.yaml` の `recheck_days`）

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
