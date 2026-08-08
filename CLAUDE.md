# pokemon-data

ポケモンマスターデータの正本レイヤー。`pokemon-distribution-app` / `distribution-scraper` /
`pokemon-ribbon-tracker` / `pokebros-blog-manager` / `pokebros-content-hub` / `pokebros-tools`
など関連リポジトリが参照する。

## 構成

- `pokemon/all.json` — ポケモンマスターデータ（種族・フォーム）の正本
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
