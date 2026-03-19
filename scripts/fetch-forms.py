# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
special-forms.json をソースにして pokemon/all.json の各エントリに
forms 配列を追加・更新するスクリプト。

収録カテゴリ: mega / regional / primal / gigantamax
スキップ:     bond / zmove

実行方法:
  uv run scripts/fetch-forms.py

オプション:
  --force    既存のformsデータも再処理する
  --dry-run  保存せずに先頭10件の結果を表示
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

SPECIAL_FORMS_PATH = (
    Path(__file__).parent.parent.parent
    / "pokebros-tools"
    / "tools"
    / "summary-pages"
    / "src"
    / "data"
    / "special-forms.json"
)
OUTPUT_PATH = Path(__file__).parent.parent / "pokemon" / "all.json"

INCLUDE_CATEGORIES = {"mega", "regional", "primal", "gigantamax"}
SKIP_CATEGORIES = {"bond", "zmove"}

GAME_TO_REGION: dict[str, str] = {
    "SM": "alola",
    "USUM": "alola",
    "SwSh": "galar",
    "LA": "hisui",
    "SV": "paldea",
}

REGION_JA: dict[str, str] = {
    "alola": "アローラ",
    "galar": "ガラル",
    "hisui": "ヒスイ",
    "paldea": "パルデア",
}


def derive_form_id(
    category: str,
    form_name_ja: str,
    pokemon_name_ja: str,
    debut_game: str,
) -> str:
    """カテゴリ・フォーム名・ポケモン名・初登場ゲームから form_id を導出する。"""
    if category == "primal":
        return "primal"

    if category == "gigantamax":
        return "gmax"

    if category == "regional":
        return GAME_TO_REGION.get(debut_game, debut_game.lower())

    if category == "mega":
        # "メガ" + pokemon_name_ja を除いた末尾を取り出す
        prefix = "メガ" + pokemon_name_ja
        if form_name_ja == prefix:
            return "mega"
        if form_name_ja.startswith(prefix):
            suffix = form_name_ja[len(prefix):]
            # 末尾をハイフン区切り小文字に（例: "X" → "x"）
            return "mega-" + suffix.lower()
        # フォーム名がprefixで始まらない場合のフォールバック
        return "mega"

    # 上記以外（想定外）はそのままカテゴリ名を返す
    return category


def build_form_entry(form: dict, pokemon_name_ja: str) -> dict:
    """special-forms.json の forms エントリ1件を出力スキーマに変換する。"""
    category: str = form["category"]
    form_name_ja: str = form["formName"]
    debut_game: str = form.get("debutGame", "")

    # formId が明示指定されていればそれを優先（重複回避用）
    form_id = form.get("formId") or derive_form_id(category, form_name_ja, pokemon_name_ja, debut_game)

    # regional フォームの form_name_ja を補完
    if category == "regional":
        # form_id からリージョン部分を抽出（"paldea-combat-breed" → "paldea"）
        region_key = form_id.split("-")[0] if "-" in form_id else form_id
        region_ja = REGION_JA.get(region_key)
        if region_ja:
            if form_id == region_key:
                # 通常のリージョンフォーム（サフィックスなし）
                form_name_ja = f"{pokemon_name_ja}（{region_ja}のすがた）"
            else:
                # 亜種あり（ケンタロス等）: 元のformNameに地域名を付加
                form_name_ja = f"{form_name_ja}（{region_ja}のすがた）"
        else:
            print(f"[WARN] 未知のリージョン form_id: {form_id}")

    entry: dict = {
        "form_id": form_id,
        "form_name_ja": form_name_ja,
        "form_name_en": "",
        "types": form.get("formTypes", []),
        "category": category,
        "ability": form.get("formAbility", ""),
        "required_item": form.get("requiredItem", ""),
        "available_in": form.get("availableIn", []),
    }

    if category == "gigantamax":
        entry["gmax_move"] = form.get("gmaxMoveName", "")

    return entry


def _save(result: dict) -> None:
    sorted_result = {k: result[k] for k in sorted(result, key=lambda x: int(x))}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted_result, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="special-forms.json をソースにして all.json に forms 配列を追加・更新する"
    )
    parser.add_argument("--force", action="store_true", help="既存のformsデータも再処理する")
    parser.add_argument("--dry-run", action="store_true", help="保存せずに先頭10件の結果を表示")
    args = parser.parse_args()

    # --- ソース読み込み ---
    if not SPECIAL_FORMS_PATH.exists():
        print(f"[ERROR] {SPECIAL_FORMS_PATH} が見つかりません。")
        return
    with open(SPECIAL_FORMS_PATH, encoding="utf-8") as f:
        special_forms_data: dict = json.load(f)

    source_pokemon: list[dict] = special_forms_data.get("pokemon", [])
    print(f"special-forms.json: {len(source_pokemon)} ポケモン")

    # --- all.json 読み込み ---
    if not OUTPUT_PATH.exists():
        print(f"[ERROR] {OUTPUT_PATH} が見つかりません。先に fetch-pokemon.py を実行してください。")
        return
    with open(OUTPUT_PATH, encoding="utf-8") as f:
        result: dict[str, dict] = json.load(f)
    print(f"all.json: {len(result)} 件")

    # --- 処理対象の決定 ---
    if args.force:
        targets = source_pokemon
    else:
        targets = [
            p for p in source_pokemon
            if "forms" not in result.get(str(p["dexNo"]), {})
        ]
    print(f"処理対象: {len(targets)} ポケモン（--force: {args.force}）")

    if args.dry_run:
        targets = targets[:10]
        print(f"[DRY-RUN] 先頭 {len(targets)} 件のみ処理します（保存なし）")

    # --- カテゴリ別カウンタ ---
    category_counts: dict[str, int] = defaultdict(int)
    total_added = 0

    for pokemon in targets:
        dex_no: int = pokemon["dexNo"]
        pokemon_name_ja: str = pokemon["pokemonName"]
        dex_key = str(dex_no)

        if dex_key not in result:
            print(f"[WARN] No.{dex_no} ({pokemon_name_ja}) が all.json に存在しません。スキップ。")
            continue

        forms_out: list[dict] = []
        for form in pokemon.get("forms", []):
            category: str = form.get("category", "")
            if category in SKIP_CATEGORIES:
                continue
            if category not in INCLUDE_CATEGORIES:
                print(f"[WARN] No.{dex_no} 未知カテゴリ '{category}' をスキップ。")
                continue

            form_entry = build_form_entry(form, pokemon_name_ja)
            forms_out.append(form_entry)
            category_counts[category] += 1

        result[dex_key]["forms"] = forms_out
        total_added += len(forms_out)

        if args.dry_run:
            print(f"\n  No.{dex_no} {pokemon_name_ja}: {len(forms_out)} フォーム")
            for fe in forms_out:
                print(f"    - {fe}")

    # --- 保存 ---
    if not args.dry_run:
        _save(result)
        print(f"\n完了: 追加フォーム数 {total_added} 件 → {OUTPUT_PATH}")
    else:
        print(f"\n[DRY-RUN] 完了: 追加フォーム数（表示のみ） {total_added} 件")

    # カテゴリ別サマリー
    print("\nカテゴリ別追加件数:")
    for cat in sorted(category_counts):
        print(f"  {cat}: {category_counts[cat]} 件")


if __name__ == "__main__":
    main()
