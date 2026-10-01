# ジムリーダーの名簿・手持ち

`gym-leader-roster.json` は対象者の名簿、`gym-leaders.json` は作品別の手持ちの正本です。
取得元は Bulbapedia。日本語資料との照合は未完了のため、記事を公開する前に照合・レビューしてください。
既存の四天王・チャンピオンなどのデータ（content-hub の `reference-data/trainer-parties.json`）は今回移設していません。

## フィールド

名簿は `source`（一覧の資料URL）、`scope`（対象範囲）、`trainers` を持ちます。
各行の `page` は Bulbapedia のページ名、`ja` は日本語名、`region` は地方、`order` は地方内の索引の並び順、
`type_en` は専門タイプです。`order` は攻略順を示しません。`Various` は複数タイプを示します。
フウとランは1組として扱います。

`allowed_rematches` は必要な人にだけ設定する再戦の取り込み例外です。
各行は資料の `section` と `location` を持ち、取得時にはこの組み合わせの完全一致を条件にします。
重複や空の条件は検証で拒否します。

手持ちは `source` と `trainers` を持ち、各トレーナーは名簿の情報と `parties` を持ちます。
各partyの `game`・`game_ja` は作品、`section`・`section_ja` は対戦区分、
`section_path` は資料の祖先見出しから現在の見出しまでの参照、`location`・`location_ja` は対戦場所です。
`branch`・`branch_ja` は分岐条件、`team` は手持ちです。PWTの手持ちは対象外です。
日本語化できていない見出しは `section_needs_review: true` を付けて未確認として保持します。

teamの主な項目は `ndex`（全国図鑑番号）、`en`・`ja`（種族名）、`form`、`level`、
`gender`・`gender_ja`、`ability_en`・`ability_ja`、`item`・`item_ja`、
`types`・`types_ja`、`tera`・`tera_ja`、`moves`（`en`・`ja`の配列）です。
値が不明な項目は推測で補完しません。

## 取得・編集・生成

正本は日本語資料との照合や手修正を加える対象です。fetchは初回seedまたは差分取り込みのために使い、
既存の正本を新規取得結果で上書きして手修正を消さないでください。
再取得はまず別ファイルへ出し、差分を確認して取り込みます。

content-hubで実行します。

```bash
uv run scripts/fetch_trainer_parties.py --kind gym-leaders --out /tmp/gym-leaders-candidate.json
uv run scripts/generate_trainer_html.py --kind gym-leaders
```

HTML生成はこの正本を読みます。生成後も公開前の日本語資料照合とレビューは必要です。

pokemon-dataでの検証:

```bash
npm run validate:gym-leaders
node scripts/test-validate-gym-leaders.mjs
```

検証は名簿の参照・重複・地方・並び順・専門タイプを確認し、手持ちが生成済みなら名簿との集合一致、
空の手持ち、PWT混入、種族名と全国図鑑番号の不一致、日本語の技名の欠落を検出します。
技の日本語表記が正しいことや資料上の数値との一致まで保証するものではありません。
