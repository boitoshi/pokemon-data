# ジムリーダーの名簿・手持ち

`gym-leader-roster.json` は対象者の名簿、`gym-leaders.json` は作品別の手持ちの正本です。
取得元は Bulbapedia。日本語資料との照合は未完了のため、記事を公開する前に照合・レビューしてください。
四天王・チャンピオンなどは下の「四天王・チャンピオン」を参照（`elite-four-roster.json`・`elite-four.json`）。

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

## 日本語資料との一次突合記録

`gym-leader-japanese-audit.json` は取得時点の資料観測と照合結果を固定した証拠記録です。
ゲームの事実の正本は引き続き `gym-leaders.json`。この記録の `source_observations`・生の資料表記を
正本として扱ったり、差分を自動で正本へ上書きしたりしません。
資料URL・見出し・取得日時・資料SHA、各正本行のSHAを保持しており、公開前には正本の変更有無を確認し、再実行・レビューしてください。

`matched` は種族・レベルと資料に明記された比較項目だけの一致です。技・性別・特性・持ち物は
資料にある場合だけ比較し、欠落項目は `gaps` に残します。フォーム・テラスタイプ・タイプなどは未評価です。
`scope` が partial の行は作品・モードの一部しか比較していません。
`difference` は資料との食い違いであり、正本の誤り確定ではありません。
`candidate_only` の差分行は編成が完全一致しない候補で、項目比較は未実施です。
`ambiguous` は候補の特定が未決、`unavailable` は今回の資料では照合できなかった行です。
公式・実機での検証や全項目の確認を意味せず、verified フラグを付けません。

content-hub の `scripts/audit_gym_japanese_sources.py` で、ネットワーク・キャッシュに触れず保存済み証拠から再計算できます。

```bash
uv run scripts/audit_gym_japanese_sources.py --replay ../pokemon-data/trainers/gym-leader-japanese-audit.json --out /tmp/gym-ja-audit-replay.json
```

後続の調査では固定した観測を手修正せず、新たな取得記録と比較結果を生成し、変更をレビューします。

## 日本語の表示名

`gym-leader-localization.json` はジム専用の見出し・場所・フォームの日本語表示名と、持ち物の参照対応の正本です。
作品名・初戦／再戦回数・難易度・版の区別を保って日本語化します。原文の `section_path` や英語名、手持ちの個体属性は保持します。
ゲーム名を含む `sections` の値は参照オブジェクトです。`group` は `games/groups.json` の `name_ja`、
`groups` は指定順の `name_ja` を「・」で連結、`title` は `games/titles.json` の `shortName` を参照します。
`group` と `title` がある場合は「グループ名（タイトル短名）」、`title` だけなら短名を表示します。
対戦条件などゲーム名以外の値は日本語文字列です。BW2のモード名は `sources.battleModeNames` の公式資料に基づきます。
ゲームやフォームの事実は `games/`・`forms/` の既存正本を参照し、このファイルへ再取得・複製しません。

`items` は英語の持ち物名を `dexNo` と `formName` に対応付け、`forms/special-forms.json` の該当フォームの
`requiredItem` から日本語名を参照します。持ち物名の別コピーは保持しません。
`forms` の対訳は表示用の `form_ja` に適用します。`form` の原文は残します。
表示名の日本語化は手持ちの事実照合を意味せず、対訳・施設名の公式表記との照合も未完了です。
`gym-leader-japanese-audit.json` の未評価範囲を日本語化によって検証済みに変更しません。

## ポケモンWikiによる追加照合

`gym-leader-pokemon-wiki-audit.json` は、ポケモンWikiから取得した表と正本を比較した別の証拠記録です。
`gym-leader-pokemon-wiki-audit.md` は同じJSONから生成する閲覧用一覧で、手編集しません。
以前の `gym-leader-japanese-audit.json` の記録を置換したり、他資料との食い違いを解決済みにしたりしません。

`source_tables` は原文の表HTML・テキストをハッシュ単位で保持し、`source_observations` は表の各戦闘条件を参照します。
`rows` は正本の人物・party index・party hashを持ちます。`matched` は比較した項目だけの一致です。
`candidate_difference` は種族・レベルが一致せず対応自体が未確定の候補、`unavailable` は今回の条件付き照合で表を特定できなかった行です。
取得拒否や資料が存在しないという意味にはしません。未記載の持ち物・特性等は「なし」にせず未照合に残します。
資料の対戦条件・難易度・版を区別し、フォーム・タイプ・テラスタイプは未照合として保持します。
正本の手持ちの事実値はこの照合で自動修正しません。公式・実機の確認とは別です。

content-hubで保存済み証拠を再比較できます（ネットワーク・取得キャッシュを使用しません）。

```bash
uv run scripts/audit_gym_pokemon_wiki.py --replay ../pokemon-data/trainers/gym-leader-pokemon-wiki-audit.json --out /tmp/gym-wiki-replay.json --markdown /tmp/gym-wiki-replay.md
```

初回取得は `--fetch`（既存キャッシュがないページだけaxで取得）、通常の取得済み表の再抽出は `--cache` を使います。
閲覧用Markdownは上のコマンドの `--markdown` でJSONと一緒に生成します。

## 四天王・チャンピオン

`elite-four-roster.json` は四天王・チャンピオン・しまキング等の名簿、`elite-four.json` は作品別の手持ちの正本です
（2026-10-07 に content-hub から移設。経緯: `../pokebros-content-hub/docs/adr/0019-elite-four-canonical.md`）。
取得元は Bulbapedia。**日本語資料との照合は未完了**です。記事やアプリに出す前に照合・レビューしてください。

名簿の各行は `page`（Bulbapedia のページ名）、`ja`、`role`（`elite_four`・`champion`・`island_kahuna`・`rival`・
`elite_four_unofficial`・`champion_unofficial`）、`region`、`order`（地方内の並び順）を持ちます。
`role` は**記事でどの枠に並べるか**（並び順・まとめ記事のチャンピオン欄）で、ゲーム内の肩書きではありません。
肩書きはストーリーの途中で変わる人がいる（ピオニー・ククイ・ハウ・ネモ・スグリなど）ので、1人1つの値では表せません。
1ページに複数人が載っている場合（トリミアンリーグ）は `options` を持ちます。
`match_name` は Party の名前がこれと一致するものだけを採る条件、`section_root` は本編以外の見出しも許可する指定、
`en` は英語名、`all_league` はその人の戦闘をすべてリーグ戦（`is_league: true`）として扱う指定です。
地方をまたぐ人（シバ・ワタル、ハラ・ライチ）は1回だけ載せています。

手持ちのフィールドはジムリーダーの `gym-leaders.json` と同じです（上の「フィールド」）。
`ja`・`role`・`region`・`order` は名簿と手持ちの両方にあります。**名簿が正本**で、手持ち側は取得時に名簿から写した値です。
直すときは名簿を直し、手持ち側の同じ値も合わせて直してください。

ゲーム内の肩書きは、party の `title_ja`（任意）に**その対戦のときの肩書き**として持たせます（例: ピオニーは全対戦で「ポケモントレーナー」）。
取得元に無い情報なので手で入れ、出典（実機・公式ページ等）は commit メッセージか research-notes に残します。
わからない対戦には付けません（推測で補完しない）。付いていない対戦では、記事・アプリは肩書きを出しません。

```bash
# content-hub で実行。既存の正本は上書きしない（別ファイルへ出して差分を取り込む）
uv run scripts/fetch_trainer_parties.py --out /tmp/elite-four-review.json
uv run scripts/generate_trainer_html.py
```
