# pokemon-data 開発ノート

> 最終更新: 2026-03-19（DLC管理・HOME連携フィールド追加・タイトル整備・groupフィールド追加・pokemon_names.json追加・game-data削除・実装計画更新）

## このリポジトリの役割

関連リポジトリ群（distribution-app / distribution-scraper / ribbon-tracker / blog-manager / content-hub / pokebros-tools）が参照する**ポケモン関連データの正本データベース**。

---

## 現在の構成（2026-03-19時点）

```
pokemon-data/
├── pokemon/
│   └── all.json              # ポケモンマスターデータ 1025件 + フォームデータ 178件
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
| mega | 88 | ZA新規25件含む |
| regional | 55 | アローラ・ガラル・ヒスイ・パルデア |
| gigantamax | 33 | gmax_moveフィールド付き |
| primal | 2 | グラードン・カイオーガ |

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
```

---

## 完了済みタスク（2026-03-19）

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

## 今後の実装予定

### 優先度高

#### 1. `distribution-scraper/mappings/games.json` の正本化
- 現状: distribution-scraper が独自フォーマットで管理（symlink未移行の唯一のファイル）
- 方針: `distribution-scraper` の `games.json` が必要とするフィールドを調査し、
  `pokemon-data/games/titles.json` から生成するスクリプトか変換アダプターを実装
- 前提: 他リポジトリからも同様の需要が出てきたら対応（YAGNI原則）

### 優先度中

#### 3. `ribbon-tracker` の ZA（legends_za）対応
- 現状: `distribution-scraper` の EXCLUDED_IDS に登録されており取得スキップ中
- **ZAリボン・あかし内容は2026年春のHOME連携まで確認不可**
- HOME連携後に確認してから ribbon-tracker と distribution-scraper を更新する

#### 4. フォームデータのスコープ拡張（検討）
- `zmove` カテゴリ（現状スキップ）: ネクロズマ等タイプ変化フォームを含む可能性
- `bond` カテゴリ（現状スキップ）: サトシゲッコウガなど

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
| 配信ポケモンデータ正本 | `../pokemon-distribution-app/public/pokemon.json` |
| ゲームタイトル定義（参照元） | `../pokemon-ribbon-tracker/src/lib/data/games.ts` |
| 旧ポケモン名データ（廃止予定） | `../pokebros-content-hub/reference-data/pokemon-names.json`（削除済み） |
