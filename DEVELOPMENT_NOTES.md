# pokemon-data 開発ノート

> 最終更新: 2026-03-21（games.json正本化・zmove/bondフォームデータ追加）

## このリポジトリの役割

関連リポジトリ群（distribution-app / distribution-scraper / ribbon-tracker / blog-manager / content-hub / pokebros-tools）が参照する**ポケモン関連データの正本データベース**。

---

## 現在の構成（2026-03-19時点）

```
pokemon-data/
├── pokemon/
│   └── all.json              # ポケモンマスターデータ 1025件 + フォームデータ 202件
├── games/
│   ├── titles.json           # ゲームタイトル 43件（Gen1〜Gen10/ZA + ぽこ あ ポケモン）。groupフィールド付き
│   ├── groups.json           # グループ定義 26件（"SwSh", "SV"等のペア単位キー）
│   └── generations.json      # 世代定義 10件
├── abilities/
│   └── all.json              # 特性 310件（name_en 補完済み）
├── mappings/
│   ├── pokemon_names.json    # ポケモン名 英日マッピング 1025件（generate_pokemon_names.py で生成）
│   ├── ribbons.json          # リボン・あかし 英日マッピング（ribbon 53件 + mark 55件）
│   ├── distribution-methods.json
│   ├── regions.json
│   ├── met-locations.json
│   ├── forms.json
│   ├── types.json            # 全18タイプ 英日
│   ├── natures.json          # 全25せいかく（上昇/下降ステータス付き）
│   └── balls.json            # ボール 28種
└── scripts/
    ├── fetch-pokemon.py           # PokeAPIからマスターデータ取得
    ├── fetch-forms.py             # special-forms.jsonからフォームデータ取得
    ├── fetch-form-names-en.py     # PokeAPIからフォーム英語名を取得
    ├── fetch-ability-names.py     # PokeAPIからabilities/all.jsonのname_en補完
    └── generate_pokemon_names.py  # all.json → mappings/pokemon_names.json 生成
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
| regional | 58 | アローラ・ガラル・ヒスイ・パルデア |
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

## 完了済みタスク

### 2026-03-21

| # | タスク | 詳細 |
|---|---|---|
| 9 | `mappings/games.json` の正本化 | `generate-games-mapping.py` を実装。`titles.json` から自動生成（61エントリ）。distribution-scraper の `games.json` をシンボリックリンクに移行 |
| 10 | フォームデータに zmove/bond 追加 | `fetch-forms.py` を更新。zmove 19件（z_crystal・z_moveフィールド付き）+ bond 1件（サトシゲッコウガ）を収録。total 202件 |

### 2026-03-19

| # | タスク | 詳細 |
|---|---|---|
| 1 | `abilities/all.json` の `name_en` 補完 | `fetch-ability-names.py` で310件全て補完 |
| 2 | `game-data/` ディレクトリの削除 | `ability_list.json` を `abilities/all.json` に移行し削除完了 |
| 3 | `regional` フォームの `form_name_ja` 修正 | "コラッタ（アローラのすがた）" 形式で統一 |
| 4 | `form_name_en` の追加 | `fetch-form-names-en.py` で178件完全カバー |
| 5 | form_id重複問題の解決 | ケンタロス・ウーラオスのform_id修正 |
| 6 | `games/titles.json` の補完 | ZA発売日・DLC・HOME連携・groupフィールド追加（全43タイトル） |
| 7 | `mappings/` の distribution-scraper への正本化 | symlink移行完了（10ファイル）、build_mappings.pyにsymlink guard追加 |
| 8 | `mappings/pokemon_names.json` 生成 | `generate_pokemon_names.py` 実装、all.json → 1025件の英日lookup生成 |

---

## 今後の実装予定 / 整備すべきデータ一覧

> 最終更新: 2026-06-05

### 凡例

| 記号 | 意味 |
|---|---|
| ✅ | 整備済み（pokemon-data に正本あり） |
| 🔶 | 部分整備（名前マッピングのみ等、情報が不完全） |
| ❌ | 未整備 |

---

### ゲーム・タイトル関連

| データ | 状態 | 場所 / 備考 |
|---|---|---|
| ゲームタイトル一覧（発売日・プラットフォーム・世代） | ✅ | `games/titles.json` 43件。`releaseDate_jp` / `releaseDate_us` あり |
| ゲームグループ定義（ペア単位キー） | ✅ | `games/groups.json` 26件 |
| 世代定義 | ✅ | `games/generations.json` 10件 |
| スピンオフ・外伝タイトルの発売日 | ❌ | ポケモン不思議のダンジョン・ポケモンスタジアム等、`titles.json` 対象外のタイトル |
| アプリ・サービスのサービス開始・終了日 | ❌ | ポケモンGO・HOME・バンク等。終了済みサービス（Dream World等）も含めると有用 |

---

### ポケモンマスターデータ

| データ | 状態 | 場所 / 備考 |
|---|---|---|
| ポケモン基本情報（名前・タイプ・世代・伝説/幻） | ✅ | `pokemon/all.json` 1025件 |
| フォームデータ（メガ・リージョン・ギガ・Zワザ等） | ✅ | `pokemon/all.json` forms配列 202件 |
| 名前 英日マッピング | ✅ | `mappings/pokemon_names.json` 1025件 |
| 種族値（HP/攻撃/防御/特攻/特防/素早さ） | ❌ | PokeAPI で取得可能。ribbon-tracker 等で需要が出たら追加 |
| タマゴグループ | ❌ | 育て屋・繁殖関連ツールで需要が出たら追加 |
| 進化チェーン | ❌ | PokeAPI `/evolution-chain` で取得可能 |
| ポケモン図鑑テキスト | ❌ | 需要・容量が大きいため別途検討 |
| 捕捉率・幸福度初期値 | ❌ | 低優先。需要次第 |

---

### 特性

| データ | 状態 | 場所 / 備考 |
|---|---|---|
| 特性一覧（英日名） | ✅ | `abilities/all.json` 310件 |
| 特性の効果説明文 | ❌ | 低優先。PokeAPI `flavor_text_entries` で取得可能 |

---

### リボン・あかし

| データ | 状態 | 場所 / 備考 |
|---|---|---|
| リボン名 英日マッピング | 🔶 | `mappings/ribbons.json` 53件（名前のみ） |
| あかし名 英日マッピング | 🔶 | `mappings/ribbons.json` 55件（名前のみ） |
| リボン詳細リスト | ❌ | 入手方法・対応ゲーム・カテゴリ（バトル/コンテスト/イベント等）付きの `ribbons/ribbons.json` |
| あかし詳細リスト | ❌ | 入手条件（時間帯/天気/個性等）付きの `ribbons/marks.json` |
| ZAリボン・あかし | ❌ | **HOME連携後に確認**（2026年春以降）。`ribbon-tracker` の EXCLUDED_IDS に登録中 |

---

### わざ・アイテム

| データ | 状態 | 場所 / 備考 |
|---|---|---|
| わざ一覧（英日名・タイプ・分類・威力・命中） | ❌ | `moves.json`。distribution-scraper が PokeAPI フラット lookup を使用中 |
| アイテム一覧（英日名・カテゴリ） | ❌ | `items.json`。複数リポジトリから参照需要が出たら pokemon-data に取り込む |
| TM/TR/HMリスト（ゲームごと） | ❌ | わざ一覧整備後に対応 |

---

### マッピング類

| データ | 状態 | 場所 / 備考 |
|---|---|---|
| タイプ一覧 英日 | ✅ | `mappings/types.json` 18タイプ |
| せいかく一覧（上昇/下降ステータス付き） | ✅ | `mappings/natures.json` 25件 |
| ボール一覧 | ✅ | `mappings/balls.json` 28種 |
| 地方一覧 | ✅ | `mappings/regions.json` |
| 捕まえた場所（met-location） | ✅ | `mappings/met-locations.json` |
| 配信方法 | ✅ | `mappings/distribution-methods.json` |
| フォーム名マッピング | ✅ | `mappings/forms.json` |
| ゲームタイトルマッピング（abbrev→id） | ✅ | `mappings/games.json`（generate-games-mapping.py で自動生成） |
| タイプ相性表 | ❌ | 低優先。18×18の相性倍率テーブル |

---

### 優先度メモ

- **高**: ZAリボン・あかし（HOME連携後に要対応）
- **中**: リボン詳細リスト・あかし詳細リスト（ribbon-tracker の表示情報充実化に直結）
- **中**: わざ一覧 `moves.json`（distribution-scraper の PokeAPI 依存を正本化）
- **低（YAGNI）**: 種族値・タマゴグループ・進化チェーン・アイテム一覧・タイプ相性表

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
| 配信ポケモンデータ正本 | `../pokemon-distribution-app/public/pokemon.json` |
| ゲームタイトル定義（参照元） | `../pokemon-ribbon-tracker/src/lib/data/games.ts` |
| 旧ポケモン名データ（廃止予定） | `../pokebros-content-hub/reference-data/pokemon-names.json`（削除済み） |
