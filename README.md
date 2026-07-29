# pokemon-data

ポケモンマスターデータの正本レイヤー。詳細は `DEVELOPMENT_NOTES.md` / `CLAUDE.md` を参照。

## データ一覧

- `pokemon/all.json` — ポケモンマスターデータ（種族・フォーム）の正本
- `games/` — ゲームタイトル・グループ・世代定義の正本
- `abilities/` — 特性データの正本
- `mappings/` — リボン・あかし・ボール・性格等の英日マッピング正本
- `ribbons/catalog.json` — リボン・あかし完全カタログ（取得ルート付き）の正本
- `distributions/*.json` — 配信ポケモンデータの正本（L2）
- `build/pokemon.json` — 上記を join した成果物（L3・コミット方式）
