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
