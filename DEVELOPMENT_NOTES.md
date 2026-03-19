# pokemon-data 開発ノート

> 最終更新: 2026-03-19

## このリポジトリの役割

関連リポジトリ群（distribution-app / distribution-scraper / ribbon-tracker / blog-manager / content-hub / pokebros-tools）が参照する**ポケモン関連データの正本データベース**。

---

## 現在の構成（2026-03-19時点）

```
pokemon-data/
├── pokemon/
│   └── all.json              # ポケモンマスターデータ 1025件 + フォームデータ
├── games/
│   ├── titles.json           # ゲームタイトル 41件（Gen1〜Gen10/ZA）
│   └── generations.json      # 世代定義 10件
├── abilities/
│   └── all.json              # 特性 310件（name_enは空、要補完）
├── mappings/
│   ├── ribbons.json          # リボン・あかし 英日マッピング
│   ├── distribution-methods.json
│   ├── regions.json
│   ├── met-locations.json
│   ├── forms.json
│   ├── types.json            # 全18タイプ 英日
│   ├── natures.json          # 全25せいかく（上昇/下降ステータス付き）
│   └── balls.json            # ボール 28種
├── game-data/
│   └── ability_list.json     # 旧ファイル（abilities/all.jsonに移行済み、削除待ち）
└── scripts/
    ├── fetch-pokemon.py      # PokeAPIからマスターデータ取得
    └── fetch-forms.py        # special-forms.jsonからフォームデータ取得
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

ソース: `pokebros-tools/tools/summary-pages/src/data/special-forms.json`
更新時: `uv run scripts/fetch-forms.py --force`

---

## データ更新スクリプト

```bash
# ポケモンマスターデータ（Gen追加時）
uv run scripts/fetch-pokemon.py

# フォームデータ（special-forms.json更新後）
uv run scripts/fetch-forms.py --force

# 特性の英語名補完（未実装・要対応）
# → abilities/all.json の name_en が全て "" のまま
# → PokeAPIから取得するスクリプトを作る必要あり
```

---

## 今後の実装予定

### 優先度高

#### 1. `abilities/all.json` の `name_en` 補完スクリプト
- `abilities/all.json` の `name_en` が全310件 `""` のまま
- PokeAPI `/ability/{id}` の `names` から英語名を取得する
- `distribution-scraper` が英語ソース（Bulbapedia）を使うため必要
- スクリプト: `scripts/fetch-ability-names.py` として作成

#### 2. `game-data/` ディレクトリの削除
- `game-data/ability_list.json` は `abilities/all.json` に移行済み
- 旧ファイルを削除してディレクトリも消す

#### 3. `regional` フォームの `form_name_ja` 修正
- 現在リージョンフォームの `form_name_ja` がベースポケモン名のまま（例: "コラッタ"）
- 正しくは "コラッタ（アローラのすがた）" にすべき
- `special-forms.json` に `formName` がそうなっていないため、`derive_form_id` と合わせて修正が必要
  - `category: regional` かつ `form_id` から地域名を付加するロジックを追加

### 優先度中

#### 4. `form_name_en` の追加
- 現状 `form_name_en` フィールドが存在しない
- PokeAPI `/pokemon-form/{name}` から取得（メガ・リージョン等）
- ZA新規メガはPokeAPIにない可能性が高いため手動追記

#### 5. `pokemon/all.json` の Gen10（ZA）対応
- 現状 No.1026以降は未収録
- ZAの新ポケモン番号が確定したら `fetch-pokemon.py` の `TOTAL_POKEMON` を更新
- ZA固有ポケモンはPokeAPI未対応の可能性があるため手動追記も想定

#### 6. `mappings/` の他リポジトリへの正本化
- 現状 `distribution-scraper/mappings/` に同様のデータが存在（二重管理）
- `distribution-scraper` が `pokemon-data/mappings/` を参照するように移行
- 方法: git submodule または相対パス参照

### 優先度低

#### 7. `games/titles.json` の補完
- `legends_za` の `releaseDate_jp` / `releaseDate_us` が `null` → 実際の日付を入力
- Switch 2のプラットフォーム記述を統一

#### 8. フォームデータのスコープ拡張（検討）
- `zmove` カテゴリ（現状スキップ）: ネクロズマ等タイプ変化フォームを含む可能性
- `bond` カテゴリ（現状スキップ）: サトシゲッコウガなど

---

## 設計方針メモ（Opusレビュー 2026-03-19）

- `all.json` はオブジェクト形式 `{"1": {...}}` を維持（図鑑番号でO(1)参照のため）
- ベースフォームの `types` はそのまま（メガ等のタイプは `forms` を参照）
- `forms` フィールドのないポケモンは `forms` キー自体なし（空配列ではない）
- `form_id` はPokeAPI命名規則に準拠（将来的な英語ソースとの照合用）
- `gigantamax` はタイプ変化なしでも収録（`gmax_move` 情報が有用なため）

---

## 関連ファイルの場所

| データ | 場所 |
|---|---|
| フォームデータ正本（ソース） | `../pokebros-tools/tools/summary-pages/src/data/special-forms.json` |
| 配信ポケモンデータ正本 | `../pokemon-distribution-app/public/pokemon.json` |
| ゲームタイトル定義（参照元） | `../pokemon-ribbon-tracker/src/lib/data/games.ts` |
| 旧ポケモン名データ（廃止予定） | `../pokebros-content-hub/reference-data/pokemon-names.json`（削除済み） |
