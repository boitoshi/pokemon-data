# pokemon-data

ポケモンマスターデータの正本レイヤー。詳細は `DEVELOPMENT_NOTES.md` / `AGENTS.md` を参照。

## データ一覧

- `pokemon/all.json` — ポケモンマスターデータ（種族・フォーム）の正本
- `pokemon/history.json` — 種族・フォームの時系列の事実（過去タイプ・フォーム登場ソフト）の正本（手書き。ADR 0016）
- `pokemon/game-compatibility.json` — 作品（ゲームグループ）に入れる種族の対応（全国図鑑番号。収集データ正本）
- `forms/special-forms.json` — 特殊フォーム（メガ・リージョン・キョダイマックス等）の定義の正本
- `games/` — ゲームタイトル・グループ・世代定義の正本
- `games/progression-gates.json` — 交換・転送・コンテスト施設の進行度解放条件（手書き）
- `abilities/` — 特性データの正本
- `mappings/` — リボン・あかし・ボール・性格等の英日マッピング正本
- `mappings/form-image-suffixes.json` — 姿名 → 画像ファイル名の ASCII サフィックス（日本語→ASCII。content-hub ADR 0020）
- `ribbons/catalog.json` — リボン・あかし完全カタログ（取得ルート付き）の正本
- `services/all.json` — 通信サービス（WFC・PGL・ポケモンバンク等）の終了日時の正本（手書き）
- `distributions/*.json` — 配信ポケモンデータの正本（L2）
- `trainers/` — ジムリーダー・四天王の名簿と手持ちの正本（詳細は `trainers/README.md`）
- `tcg/releases.json` — ポケモンカードゲームの発売スケジュール正本（手書き）
- `audits/` — 確認記録（証拠記録。現在は第3世代配信の受け取り経路。配信正本は変更しない）
- `schemas/data-contracts.json` — 主要データファイルの必須キー・最小件数の契約（`npm run validate` が使う）
- `build/pokemon.json` — 上記を join した成果物（L3・コミット方式）
- `build/abbreviations.json` — ゲーム名・配布方法の略称対照表（L3・コミット方式。`npm run build` で生成）
- `build/meta.json` — `build/pokemon.json` のサイドカー（件数等）
- `poco-a-pokemon/events.json` / `raids/tera-raids.json` — イベント期限表（手書き）。更新時は `checkedUntil` も進める
