# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
games/titles.json をソースにして mappings/games.json を生成するスクリプト。

生成内容:
  games      : Bulbapedia略称（小文字）→ 日本語表示名
  full_names : 英語タイトル（"Pokémon " プレフィクス除去済み）→ 日本語表示名
  gen_overrides : 世代固有の略称オーバーライド（Bulbapedia 表記ゆれ補正用）

実行方法:
  uv run scripts/generate-games-mapping.py
  uv run scripts/generate-games-mapping.py --dry-run
"""

import argparse
import json
from pathlib import Path

TITLES_PATH = Path(__file__).parent.parent / "games" / "titles.json"
OUTPUT_PATH = Path(__file__).parent.parent / "mappings" / "games.json"

# shortName がそのままでは表示に使えないタイトルの表示名オーバーライド
# キーは titles.json の id フィールド
# （shortName が略称になっているタイトルは日本語表示名を直書きする）
DISPLAY_OVERRIDES: dict[str, str] = {
    "lets_go_pikachu": "ピカチュウ（Let's Go）",
    "lets_go_eevee": "イーブイ（Let's Go）",
    # shortName が略称になっているタイトル
    "firered": "ファイアレッド",
    "leafgreen": "リーフグリーン",
    "brilliant_diamond": "ブリリアントダイヤモンド",
    "legends_arceus": "Pokémon LEGENDS アルセウス",
    "legends_za": "Pokémon LEGENDS Z-A",
}

# titles.json から自動導出できない Bulbapedia 固有略称
# （複数グループ結合・通称コード等）
CUSTOM_ENTRIES: dict[str, str] = {
    # Let's Go 系の Bulbapedia 略称（"P", "E", "PE"）
    "p": "ピカチュウ（Let's Go）",
    "e": "イーブイ（Let's Go）",
    "pe": "ピカブイ",
    # 複数世代をまとめた Bulbapedia 略称
    "smusum": "サン, ムーン, ウルトラサン, ウルトラムーン",
    "dppt": "ダイヤモンド, パール, プラチナ",
    "rse": "ルビー, サファイア, エメラルド",
    # M-dimension は ZA の DLC（available_in で使われる）
    "m-dimension": "M次元ラッシュ（ZA DLC）",
}

# 世代固有の略称オーバーライド（Bulbapedia は世代内で略称が衝突する場合がある）
# 例: Gen7 では "S" → サン（サン・ムーン）、Gen9 では "S" → スカーレット
GEN_OVERRIDES: dict[str, dict[str, str]] = {
    "7": {
        "s": "サン",
        "m": "ムーン",
    },
}


def get_display_name(title: dict) -> str:
    """タイトルエントリの表示名を返す（DISPLAY_OVERRIDES 優先）。"""
    return DISPLAY_OVERRIDES.get(title["id"], title["shortName"])


def build_games_map(titles: list[dict]) -> dict[str, str]:
    """
    titles から games マップを構築する。

    1. 個別エントリ: abbrev.lower() → display_name
    2. グループエントリ: group.lower() → カンマ結合の display_name
    3. CUSTOM_ENTRIES でオーバーライド/追記
    """
    games: dict[str, str] = {}

    # 1. 個別エントリ（後勝ち: 同じ abbrev なら世代の新しいタイトルで上書き）
    for title in titles:
        abbrev = title.get("abbrev", "")
        if not abbrev:
            continue
        games[abbrev.lower()] = get_display_name(title)

    # 2. グループエントリ
    #    group → [display_name, ...] を収集し、カンマ結合
    group_names: dict[str, list[str]] = {}
    for title in titles:
        group = title.get("group", "")
        if not group:
            continue
        name = get_display_name(title)
        if group not in group_names:
            group_names[group] = []
        if name not in group_names[group]:
            group_names[group].append(name)

    for group_id, names in group_names.items():
        key = group_id.lower()
        # 複数タイトルのグループのみグループエントリとして追加
        # （単独タイトルは個別エントリと重複するためスキップ）
        if len(names) > 1:
            games[key] = ", ".join(names)

    # 3. Bulbapedia 固有略称を追記/オーバーライド
    games.update(CUSTOM_ENTRIES)

    # アルファベット順にソート
    return dict(sorted(games.items()))


def build_full_names(titles: list[dict]) -> dict[str, str]:
    """
    full_names マップを構築する。
    英語タイトルから "Pokémon " プレフィクスを除去した文字列 → 日本語 shortName。
    （distribution-scraper では未使用だが参照用に残す）
    """
    full_names: dict[str, str] = {}
    for title in titles:
        name_en = title.get("name_en", "")
        if not name_en:
            continue
        key = name_en.removeprefix("Pokémon ").removeprefix("Pokémon: ")
        full_names[key] = get_display_name(title)
    return dict(sorted(full_names.items()))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="games/titles.json から mappings/games.json を生成する"
    )
    parser.add_argument("--dry-run", action="store_true", help="保存せずに結果を表示")
    args = parser.parse_args()

    # --- titles.json 読み込み ---
    if not TITLES_PATH.exists():
        print(f"[ERROR] {TITLES_PATH} が見つかりません。")
        return
    with open(TITLES_PATH, encoding="utf-8") as f:
        titles: list[dict] = json.load(f)
    print(f"titles.json: {len(titles)} タイトル")

    # --- ビルド ---
    games_map = build_games_map(titles)
    full_names_map = build_full_names(titles)

    output = {
        "_description": "ゲーム略称マッピング（Bulbapedia表記 → ポケブロス表記）。generate-games-mapping.py で自動生成。",
        "_source": "games/titles.json + CUSTOM_ENTRIES + GEN_OVERRIDES",
        "games": games_map,
        "full_names": full_names_map,
        "gen_overrides": GEN_OVERRIDES,
    }

    if args.dry_run:
        print("\n[DRY-RUN] 生成結果（保存なし）:")
        print(json.dumps(output, ensure_ascii=False, indent=2))
        print(f"\ngames エントリ数: {len(games_map)}")
        print(f"full_names エントリ数: {len(full_names_map)}")
        return

    # --- 保存 ---
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完了 → {OUTPUT_PATH}")
    print(f"  games エントリ数: {len(games_map)}")
    print(f"  full_names エントリ数: {len(full_names_map)}")

    # --- 既存 games.json との差分チェック ---
    dist_games_path = (
        Path(__file__).parent.parent.parent
        / "distribution-scraper"
        / "mappings"
        / "games.json"
    )
    if dist_games_path.exists() and not dist_games_path.is_symlink():
        with open(dist_games_path, encoding="utf-8") as f:
            old = json.load(f)
        old_games = set(old.get("games", {}).keys())
        new_games = set(games_map.keys())
        added = new_games - old_games
        removed = old_games - new_games
        if added:
            print(f"\n  追加されたキー: {sorted(added)}")
        if removed:
            print(f"  削除されたキー: {sorted(removed)}")
        if not added and not removed:
            print("  差分なし（キー数は同一）")


if __name__ == "__main__":
    main()
