# pokemon-data

ポケモンマスターデータの正本レイヤー。詳細は `DEVELOPMENT_NOTES.md` / `AGENTS.md` を参照。

## データ一覧

- `pokemon/all.json` — ポケモンマスターデータ（種族・フォーム）の正本
- `pokemon/history.json` — 種族・フォームの時系列の事実（過去タイプ・フォーム登場ソフト）の正本（手書き。ADR 0016）
- `forms/special-forms.json` — 特殊フォーム（メガ・リージョン・キョダイマックス等）の定義の正本
- `games/` — ゲームタイトル・グループ・世代定義の正本
- `abilities/` — 特性データの正本
- `mappings/` — リボン・あかし・ボール・性格等の英日マッピング正本
- `ribbons/catalog.json` — リボン・あかし完全カタログ（取得ルート付き）の正本
- `services/all.json` — 通信サービス（WFC・PGL・ポケモンバンク等）の終了日時の正本（手書き）
- `distributions/*.json` — 配信ポケモンデータの正本（L2）
- `trainers/` — ジムリーダー・四天王の名簿と手持ちの正本（詳細は `trainers/README.md`）
- `build/pokemon.json` — 上記を join した成果物（L3・コミット方式）
- `poco-a-pokemon/events.json` / `raids/tera-raids.json` — イベント期限表（手書き）。更新時は `checkedUntil` も進める
