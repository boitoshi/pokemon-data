# pokemon-data 開発ノート

> 最終更新: 2026-07-29（ribbons/catalog.json 新設・配信L2直接出力化・国際配信取り込み）

## このリポジトリの役割

関連リポジトリ群（distribution-app / distribution-scraper / ribbon-tracker / blog-manager / content-hub / pokebros-tools）が参照する**ポケモン関連データの正本データベース**。

---

## 現在の構成（2026-07-29時点）

```
pokemon-data/
├── pokemon/
│   └── all.json              # ポケモンマスターデータ 1025件 + フォームデータ 199件
├── games/
│   ├── titles.json           # ゲームタイトル 43件（Gen1〜Gen10/ZA + ぽこ あ ポケモン）。groupフィールド付き
│   ├── groups.json           # グループ定義 26件（"SwSh", "SV"等のペア単位キー）
│   └── generations.json      # 世代定義 10件
├── abilities/
│   └── all.json              # 特性 316件（name_en 補完済み）
├── mappings/
│   ├── pokemon_names.json    # ポケモン名 英日マッピング 1025件（generate_pokemon_names.py で生成）
│   ├── ribbons.json          # リボン・あかし 英日マッピング（ribbon 49件 + mark 53件）。ribbons/catalog.json のサブセット
│   ├── distribution-methods.json
│   ├── regions.json
│   ├── met-locations.json
│   ├── forms.json
│   ├── types.json            # 全18タイプ 英日
│   ├── natures.json          # 全25せいかく（上昇/下降ステータス付き）
│   └── balls.json            # ボール 29種
├── ribbons/
│   └── catalog.json          # リボン・あかし完全カタログ（取得ルート付き）の正本
├── distributions/
│   ├── gen5.json〜gen9.json   # 配信ポケモン L2 正本（世代別）
│   ├── champions.json        # 大会・チャンピオン系配信の L2 正本
│   └── schema.json           # distributions/*.json のスキーマ定義
├── build/
│   ├── pokemon.json          # L3 成果物（app-runtime schema・両アプリ共通・コミット方式）
│   └── meta.json             # build/pokemon.json のサイドカー（件数等のメタ情報）
├── schemas/
│   └── data-contracts.json   # データ契約定義
├── poco-a-pokemon/
│   └── events.json           # 「ぽこ あ ポケモン」イベントデータ（期限表・手書き）
├── raids/
│   └── tera-raids.json       # SV のテラレイド（最強レイド等）の期限表・手書き
└── scripts/
    ├── fetch-pokemon.py            # PokeAPIからマスターデータ取得
    ├── fetch-forms.py              # special-forms.jsonからフォームデータ取得
    ├── fetch-form-names-en.py      # PokeAPIからフォーム英語名を取得
    ├── fetch-ability-names.py      # PokeAPIからabilities/all.jsonのname_en補完
    ├── generate_pokemon_names.py   # all.json → mappings/pokemon_names.json 生成
    ├── generate-games-mapping.py   # titles.json → mappings/games.json 生成
    ├── build-distributions.mjs     # L2正本＋L1マスターを join し build/pokemon.json を生成
    ├── test-build-compat.mjs       # build/pokemon.json と distribution-app 側成果物の互換性検証
    ├── validate-data.mjs           # マスターデータの検証
    ├── validate-distributions.mjs  # 配信正本（distributions/*.json）の検証
    ├── validate-ribbons.mjs        # リボン・あかしデータの検証
    ├── scrape-to-l2.mjs            # distribution-scraper の出力を L2 正本へ取り込み（provenance-aware upsert）
    ├── anchor.mjs                  # L2 取り込み時のアンカー処理
    ├── verify-anchor.mjs           # アンカーの検証
    ├── migrate-gen5-7.mjs          # 旧データからのGen5〜7移行（一度きりの seed）
    ├── migrate-from-app.mjs        # distribution-app からの移行（一度きりの seed）
    └── migrate-champions.mjs       # champions.json の移行（一度きりの seed）
```

---

## pokemon/all.json の構造

```json
{
  "6": {
    "no": 6,
    "name_ja": "リザードン",
    "name_en": "Charizard",
    "gen": 1,
    "is_legendary": false,
    "is_mythical": false,
    "types": ["ほのお", "ひこう"],
    "forms": [
      {
        "form_id": "mega-x",
        "form_name_ja": "メガリザードンX",
        "form_name_en": "Mega Charizard X",
        "types": ["ほのお", "ドラゴン"],
        "category": "mega",
        "ability": "かたいツメ",
        "required_item": "リザードナイトX",
        "available_in": ["XY", "ORAS", "SM", "USUM", "LPLE", "ZA", "M-dimension"]
      }
    ]
  }
}
```

### forms カテゴリ一覧

| category | 件数 | 内容 |
|---|---|---|
| mega | 89 | ZA新規25件含む |
| regional | 55 | アローラ・ガラル・ヒスイ・パルデア |
| gigantamax | 33 | gmax_moveフィールド付き |
| primal | 2 | グラードン・カイオーガ |
| zmove | 19 | z_crystal・z_moveフィールド付き（SM/USUM専用Zワザ持ち） |
| bond | 1 | サトシゲッコウガ（きずなへんげ） |

ソース: `pokebros-tools/tools/summary-pages/src/data/special-forms.json`
更新時: `uv run scripts/fetch-forms.py --force && uv run scripts/fetch-form-names-en.py`

---

## games/titles.json の構造

```json
{
  "id": "sword",
  "name": "ポケットモンスター ソード",
  "name_en": "Pokémon Sword",
  "shortName": "ソード",
  "abbrev": "SW",
  "generation": 8,
  "releaseDate_jp": "2019-11-15",
  "releaseDate_us": "2019-11-15",
  "platform": "Switch",
  "category": "mainline",
  "paired_with": ["shield"],
  "region": "ガラル",
  "dlc": [
    { "id": "ioa", "name": "鎧の孤島", "name_en": "The Isle of Armor", "releaseDate_jp": "2020-06-17", "releaseDate_us": "2020-06-17" },
    { "id": "ct",  "name": "冠の雪原", "name_en": "The Crown Tundra",  "releaseDate_jp": "2020-10-22", "releaseDate_us": "2020-10-22" }
  ],
  "home": { "send": true, "receive": true }
}
```

### フィールド説明

| フィールド | 説明 |
|---|---|
| `group` | ペア単位グループID（`games/groups.json` の `id` と対応）。`available_in` で使う文字列の正本定義 |
| `dlc` | DLC配列。発売日 = そのDLCで解禁される新ポケモンの実装日として管理。DLCのないタイトルはフィールド自体省略 |
| `home.send` | ゲーム→HOMEへポケモンを転送できるか |
| `home.receive` | HOME→ゲームへポケモンを受け取れるか |

### HOME連携の注意点

- Gen1〜Gen7 3DSタイトル: 直接HOME接続なし（Pokémon Bank経由のみ）→ `send/receive: false`
- レジェンズアルセウス: HOMEへ出せるが、HOMEから受け取れない → `send: true, receive: false`
- Let's Go系以降のSwitchタイトル: 基本的に `send/receive: true`

---

## ribbons/catalog.json（リボン・あかしカタログ正本）

リボン・あかしの完全カタログ。1要素 = 1リボン（フラグとしての正体）で、`routes` に取得ルート
（ribbon-tracker の1エントリに対応）を持つ。要素キーは `key / name_ja / name_en / kind
("ribbon"|"mark") / introduced_gen / notes(任意) / routes`。

- **正本はこのカタログ**。`mappings/ribbons.json` は EN→JA 対訳（配布データ用）で catalog のサブセット
- `routes[].games` は `games/titles.json` の id のみ使用（tracker 合成id `oras`/`usum`/`lets_go` や
  `firered_switch`/`leafgreen_switch` は消費側の生成時に変換・復元する）
- 消費者: ribbon-tracker `scripts/generate-ribbons.mjs`（ribbons-gen3..9.ts / marks.ts を全自動生成）
- 検証: `npm run validate:ribbons`（key/route.id ユニーク・games 実在・mappings/ribbons.json との整合）

---

## データ更新スクリプト

```bash
# ポケモンマスターデータ（Gen追加時）
uv run scripts/fetch-pokemon.py

# フォームデータ（special-forms.json更新後）
uv run scripts/fetch-forms.py --force

# フォーム英語名補完（fetch-forms.py実行後）
uv run scripts/fetch-form-names-en.py

# ゲームマッピング（titles.json更新後）
uv run scripts/generate-games-mapping.py
```

---

## 配信ポケモン正本と L3 ビルド（2026-07-23）

配信ポケモンデータの正本をこの repo に集約（旧: app→tools→app の循環同期）。3レイヤー構成:

```
L2 正本      distributions/gen5..gen9.json + champions.json（724件。内訳は build/meta.json の counts が正）
             └ distributions/schema.json 準拠。マスター(pokemon/games/mappings)を参照
L1 マスター  pokemon/all.json, games/titles.json, mappings/* ほか
L3 成果物    build/pokemon.json（app-runtime schema・両アプリ共通・コミット方式）
```

### スクリプト

| コマンド | 内容 |
|---|---|
| `npm run build`（= `node scripts/build-distributions.mjs`） | L2正本＋L1マスターを join し `build/pokemon.json` を前方向生成。migrate 3本の逆写像。REVERSE_GAME_MAP・ot単一JPN→素文字列/多言語→object・ivs・shiny・form再結合・generation注入。`build/meta.json` サイドカー＋件数単調増加ガード（減少は `ALLOW_BUILD_SHRINK=1` が必要） |
| `npm run test:build-compat`（= `node scripts/test-build-compat.mjs`） | `build/pokemon.json` を distribution-app committed `pokemon.json` と照合し「文書化済み正規化差分のみ・データロス無し」を機械検証。未登録差分1件でFAIL。sibling不在(CI)は skip |
| `npm run validate` | 既存のマスター＋配信正本 validate（build 前段の健全性） |

### build/ をコミットする理由

- 成果物は `build/*` を `.gitignore` 除外（`!build/pokemon.json` `!build/meta.json`）＝**コミット方式**。
- 既存 CI が兄弟 repo を checkout しない前提のため、consumer は生成物をそのまま参照できる。
- P4（両アプリを `build/pokemon.json` に向け替え。distribution-app の public/pokemon.json を生成物化・summary-pages の3ファイル統合・旧 sync 2本撤去・GAS 切り離し）は完了済み（2026-07）。現行フローは pokemon-data → 両アプリ pull only（distribution-app は `scripts/sync-from-pokemon-data.mjs`、summary-pages は `sync-from-pokemon-data.mjs` → `distributions.json`）。

### 移行スクリプト（一度きりの seed・逆写像の対）

`scripts/migrate-gen5-7.mjs` / `migrate-from-app.mjs` / `migrate-champions.mjs`。
`build-distributions.mjs` はこの3本の逆写像で、`test-build-compat.mjs` の allowlist は各 FIX_MAP を共有する。

---

## 期限表（イベント期限データ・2026-08-08）

「開催期間があるイベント」を手書きで持つ表。現在2本。

| ファイル | 中身 | 配列キー |
|---|---|---|
| `poco-a-pokemon/events.json` | ぽこ あ ポケモンのイベント（ゆめしま・期間限定チャレンジ等） | `events` |
| `raids/tera-raids.json` | SV のテラレイド（最強レイド・イベントレイド） | `raids` |

`distributions/*.json` とは別物。あちらは**配信個体のカタログ**で、1エントリが公開URL
`/pokemon/{id}` を持ち、`build/pokemon.json` 経由で distribution-app と summary-pages に出る。
期限表が持つのは**開催枠**で、捕れる個体は固定されない（毎回 IV も性格も違い、固定なのは
テラタイプ・レベル・あかしだけ）。カタログに載せる「その個体」が無いので混ぜない。

⚠ レイドで捕る個体が `distributions/` に入っている例はある（`08006` セキタンザン /
`08007` ラプラス＝次世代ワールドホビーフェア '20 Winter のマックスレイド、`otFromPlayer: true`）。
あれは**現地イベントで配られた特定個体**として成立しているので正しい。境目は
「レイドかどうか」ではなく「**カタログに載る個体があるかどうか**」。

### 共通ルール: `checkedUntil` と `checkedAt` を必ず持つ

```json
{
  "$schema": "tera-raids-v1",
  "checkedUntil": "2026-09-30",
  "checkedAt": "2026-08-09",
  "raids": []
}
```

**2つは別のことを表す。混同しない。**

| キー | 意味 | 答える問い |
|---|---|---|
| `checkedUntil` | **この日まで予定を確認済み**（カバー範囲） | 「どこまで把握してる？」 |
| `checkedAt` | **最後に公式を見に行った日**（鮮度） | 「最後に見たのいつ？」 |

`checkedUntil` だけだと穴が開く。イベント0件が正常な状態でありうるため、これが無いと
「予定が無い」と「誰も更新していない」が区別できない（`null` は未確認＝初回記入待ち）。
だが**それだけでは「把握済みの窓の内側に新しい短期告知が落ちた」場合を拾えない** —
`checkedUntil` はまだ未来のままなので期限系の警告は鳴らず、その告知は表に載らないまま終わる。

morning-status の対応（すべて morning brief の `needs_attention` に出る）:

| 判定 | reason |
|---|---|
| `checkedUntil` が過去日 or `null` | `event_table_expired` |
| `checkedUntil` が7日以内に来る | `event_table_expiring_soon` |
| `checkedAt` から間が空いた（テラレイド5日 / ぽこあ21日） | `event_table_stale_check` |
| 表が読めない（404・改名） | `event_table_unreadable` |

**公式を見に行ったら、新着が無くても `checkedAt` を今日の日付に進めること。**
進めないと「見ていない」と区別が付かず鳴り続ける。逆に言えば、この一手間が
「確認した」という記録そのものになる。`checkedAt` を書かない表は
ファイルの最終コミット日で代用されるが、「見たが新着なし」の日はコミットが立たないので
実際より古く出る（brief の文言に「最終更新から推定」と付く）。

テラレイドの間隔がぽこあより短いのは、SV が畳みに向かっていて告知が唐突な単発に
なりやすいうえ、取り逃すと `mightiest-mark`（さいきょうのあかし）が恒久的に埋まらないため。
ぽこあは復刻もあり本体の日付を戻せば拾えるので長め。**回収可能性で間隔を分けている。**

### エントリのフィールド（`raids/tera-raids.json`）

必須は `id` / `eventName` / `startDate` / `endDate` の4つだけ。残りは分かる範囲で埋める。
morning-status が brief に出すのは**太字の7つ**だけで、残りは記事を書くときの手控え。

| フィールド | 例 | 備考 |
|---|---|---|
| **`id`** | `"sv-2026-08-mewtwo"` | `<ソフト>-<年月>-<英名>`。重複しなければ形式は自由 |
| **`raidType`** | `"mightiest"` / `"event"` | 最強レイドか、通常のイベントレイドか |
| **`eventName`** | `"最強のミュウツー"` | 表示名 |
| **`pokemonName`** | `"ミュウツー"` | 日本語名（`mappings/pokemon_names.json` に合わせる） |
| `dexNo` | `150` | |
| `games` | `["scarlet", "violet"]` | `games/titles.json` のキー |
| `teraType` | `"かくとう"` | |
| **`startDate`** / **`endDate`** | `"2026-08-15"` | ISO日付。開催が分割されるなら期間ごとに1エントリ |
| `reward` | `"さいきょうのあかし"` | |
| **`sourceUrl`** | 公式告知URL | 出典。**推測で書かない** |

### 更新の入口

自動収集は無い（意図的）。年数件のイベントに対してスクレイパーを持つと、イベントより先に
スクレイパーが壊れるため。morning brief の `event_table_expired` 警告が更新の入口になる。

---

## 完了済みタスク

### 2026-03-21

| # | タスク | 詳細 |
|---|---|---|
| 9 | `mappings/games.json` の正本化 | `generate-games-mapping.py` を実装。`titles.json` から自動生成（games 65エントリ + full_names 42エントリ）。distribution-scraper の `games.json` をシンボリックリンクに移行 |
| 10 | フォームデータに zmove/bond 追加 | `fetch-forms.py` を更新。zmove 19件（z_crystal・z_moveフィールド付き）+ bond 1件（サトシゲッコウガ）を収録。total 199件 |

### 2026-03-19

| # | タスク | 詳細 |
|---|---|---|
| 1 | `abilities/all.json` の `name_en` 補完 | `fetch-ability-names.py` で310件全て補完（当時310件／現在316件） |
| 2 | `game-data/` ディレクトリの削除 | `ability_list.json` を `abilities/all.json` に移行し削除完了 |
| 3 | `regional` フォームの `form_name_ja` 修正 | "コラッタ（アローラのすがた）" 形式で統一 |
| 4 | `form_name_en` の追加 | `fetch-form-names-en.py` で178件完全カバー（当時178件／現在199件） |
| 5 | form_id重複問題の解決 | ケンタロス・ウーラオスのform_id修正 |
| 6 | `games/titles.json` の補完 | ZA発売日・DLC・HOME連携・groupフィールド追加（全43タイトル） |
| 7 | `mappings/` の distribution-scraper への正本化 | symlink移行完了（11ファイル）、build_mappings.pyにsymlink guard追加 |
| 8 | `mappings/pokemon_names.json` 生成 | `generate_pokemon_names.py` 実装、all.json → 1025件の英日lookup生成 |

---

## 今後の実装予定

### 優先度中

#### 1. `ribbon-tracker` の ZA（legends_za）対応
- **ZAのリボン・あかし実データ未確認（HOME連携待ち）**
- HOME連携後に確認してから ribbon-tracker と distribution-scraper を更新する

### 優先度低（YAGNI: 複数リポジトリから需要が出たら対応）

#### 5. `moves.json` / `items.json` のリッチデータ化
- 現状: distribution-scraper が PokeAPI 由来のフラット lookup を使用
- 方針: 別リポジトリからも参照需要が出た時点で pokemon-data に取り込む

---

## 設計方針メモ（Opusレビュー 2026-03-19）

- `all.json` はオブジェクト形式 `{"1": {...}}` を維持（図鑑番号でO(1)参照のため）
- ベースフォームの `types` はそのまま（メガ等のタイプは `forms` を参照）
- `forms` フィールドのないポケモンは `forms` キー自体なし（空配列ではない）
- `form_id` はPokeAPI命名規則に準拠（将来的な英語ソースとの照合用）
- `gigantamax` はタイプ変化なしでも収録（`gmax_move` 情報が有用なため）
- DLCは親タイトルの `dlc[]` 配列で管理（独立エントリにしない）
- HOME連携は `home: {send, receive}` で非対称ケース（LA等）に対応
- `availableIn` の粒度はタイトルペア単位を維持（DLC単位には細分化しない）

---

## 関連ファイルの場所

| データ | 場所 |
|---|---|
| フォームデータ正本（ソース） | `../pokebros-tools/tools/summary-pages/src/data/special-forms.json` |
| 配信ポケモンデータ正本 | `distributions/*.json`（この repo。2026-07 に app から移管。P4完了。`../pokemon-distribution-app/public/pokemon.json` は `build/pokemon.json` のコピー（`sync-from-pokemon-data.mjs` で同期）） |
| ゲームタイトル定義（参照先） | `../pokemon-ribbon-tracker/src/lib/data/games.ts`（`games/titles.json` + `groups.json` から自動生成。games.ts 冒頭に「直接編集禁止」の注記あり） |
| 旧ポケモン名データ（廃止予定） | `../pokebros-content-hub/reference-data/pokemon-names.json`（削除済み） |

---

## 大会情報の編集手順

`distributions/*.json` の `event`（`kind`/`year`/`schedule`/`location`/`winner`/`winnerX`。`schema.json` に定義済み）を直接編集する。スプレッドシート＋GAS は2026-07-29に引退済み。現在 `champions.json` の21件が `event` 入力済み。

## L2直接取り込みパイプライン

distribution-scraper の `--json` 出力を `scripts/scrape-to-l2.mjs`（provenance-aware upsert）で取り込み、`anchor.mjs` / `verify-anchor.mjs` で検証する。詳細な挙動はコードが正本。

## CI

`.github/workflows/ci.yml` は `validate` → `build` → `git diff --exit-code build/`（build 鮮度チェック）の順で実行する。**正本を直したら `npm run build` して `build/` もコミットする義務がある**。

## 既知のデータ品質課題

- `champions.json` の `distributionMethod` に `バトルパス Lv.25` と `バトルパス(無料) Lv.25` の2種類があるが、`notes` / `datasetNotes` を読む限りどちらも同じ仕組み（無料枠で Lv.25 到達時の報酬）を指しているように見える。表記ゆれの可能性が高い（2026-08-04 時点で未確認）。揃える場合は `mappings/method-glossary.json` の該当 note も一緒に整理すること
- `gen7.json` の `07100` の `distributionMethod` が `ALOLA` になっており、`validate-distributions.mjs` が warning を出し続けている。意味不明値のため `mappings/method-glossary.json` でも意図的に扱っていない
- 配信レコードのうち13件が `eventName` を英語のまま保持している（`07153`〜`07158` / `08097`〜`08099` / `08100`〜`08103`）。Bulbapedia 側に日本語のふしぎなおくりものカード名が存在しないため自動取得できない分で、手動補完が必要（経緯は distribution-scraper の TODO.md）

## 下流の消費者

- pokemon-ribbon-tracker（`scripts/generate-ribbons.mjs` 等。https://www.pokebros.net/ribbon-tracker/ で公開中）
- pokemon-distribution-app（`sync-from-pokemon-data.mjs`）
- pokebros-tools summary-pages（`sync-from-pokemon-data.mjs`）
- content-hub `scripts/generate_distribution_html.py`（配信個別記事HTML）
