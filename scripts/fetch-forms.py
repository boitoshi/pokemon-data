# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
special-forms.json（正本: pokemon-data/forms/special-forms.json）をソースにして
pokemon/all.json の各エントリに forms 配列を追加・更新するスクリプト。

収録カテゴリ: mega / regional / primal / gigantamax / zmove / bond
スキップ:     なし

同一 dexNo が special-forms.json に複数エントリで存在する場合（例: ヒヒダルマの
通常/ダルマモード、ニャオニクスの性別違い、ジュナイパーのヒスイのすがた/専用Zワザ）は
forms を累積マージする。マージ後に form_id が重複し、かつ内容も完全一致するものだけ
1件に畳む（先に出たものを残す）。

実行方法:
  uv run scripts/fetch-forms.py

オプション:
  --force    既存のformsデータも再処理する
  --dry-run  保存せずに先頭10dexNo分の結果を表示
"""

import argparse
import json
from collections import OrderedDict, defaultdict
from pathlib import Path

SPECIAL_FORMS_PATH = Path(__file__).parent.parent / "forms" / "special-forms.json"
OUTPUT_PATH = Path(__file__).parent.parent / "pokemon" / "all.json"

INCLUDE_CATEGORIES = {"mega", "regional", "primal", "gigantamax", "zmove", "bond"}
SKIP_CATEGORIES: set[str] = set()

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

    if category == "zmove":
        return "zmove"

    if category == "bond":
        return "bond"

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

    if category == "zmove":
        entry["z_crystal"] = form.get("zCrystalName", "")
        entry["z_move"] = form.get("zMoveName", "")

    return entry


def _save(result: dict) -> None:
    sorted_result = {k: result[k] for k in sorted(result, key=lambda x: int(x))}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted_result, f, ensure_ascii=False, indent=2)


def merge_forms_for_dex(
    dex_no: int,
    source_entries: list[dict],
    category_counts: dict[str, int],
) -> tuple[list[dict], int]:
    """同一 dexNo を持つ複数ソースエントリの forms を累積マージする。

    form_id が重複し、かつ内容も完全一致するものだけ1件に畳む（先に出たものを残す）。
    form_id は重複するが内容が異なる場合（正当な別フォーム）は両方残し、[WARN] を出す。

    Returns: (マージ後の forms 配列, 畳んだ件数)
    """
    raw_entries: list[dict] = []
    for pokemon in source_entries:
        pokemon_name_ja: str = pokemon["pokemonName"]
        for form in pokemon.get("forms", []):
            category: str = form.get("category", "")
            if category in SKIP_CATEGORIES:
                continue
            if category not in INCLUDE_CATEGORIES:
                print(f"[WARN] No.{dex_no} 未知カテゴリ '{category}' をスキップ。")
                continue
            raw_entries.append(build_form_entry(form, pokemon_name_ja))

    # form_id ごとにグルーピング（出現順を維持）
    groups: "OrderedDict[str, list[dict]]" = OrderedDict()
    for entry in raw_entries:
        groups.setdefault(entry["form_id"], []).append(entry)

    forms_out: list[dict] = []
    collapsed = 0
    for form_id, entries in groups.items():
        first = entries[0]
        forms_out.append(first)
        if len(entries) > 1:
            dup_count = 0
            distinct_extra: list[dict] = []
            for e in entries[1:]:
                if e == first:
                    dup_count += 1
                else:
                    distinct_extra.append(e)
            if dup_count:
                collapsed += dup_count
                print(
                    f"[INFO] No.{dex_no} form_id='{form_id}' の完全重複 {dup_count} 件を畳みました。"
                )
            if distinct_extra:
                print(
                    f"[WARN] No.{dex_no} form_id='{form_id}' が{len(distinct_extra)}件"
                    "内容差分ありで衝突しています。データ欠落を避けるため両方残します。"
                )
                forms_out.extend(distinct_extra)

    for entry in forms_out:
        category_counts[entry["category"]] += 1

    return forms_out, collapsed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="special-forms.json をソースにして all.json に forms 配列を追加・更新する"
    )
    parser.add_argument("--force", action="store_true", help="既存のformsデータも再処理する")
    parser.add_argument("--dry-run", action="store_true", help="保存せずに先頭10dexNo分の結果を表示")
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

    # --- dexNo 単位へ集約（同一 dexNo の複数ソースエントリをまとめる） ---
    grouped_by_dex: "OrderedDict[int, list[dict]]" = OrderedDict()
    for p in source_pokemon:
        grouped_by_dex.setdefault(p["dexNo"], []).append(p)
    print(f"special-forms.json: dexNo単位で {len(grouped_by_dex)} 件（重複dexNo統合後）")

    # --- 処理対象の決定（判定単位は dexNo） ---
    if args.force:
        target_dex_nos = list(grouped_by_dex.keys())
    else:
        target_dex_nos = [
            dex_no for dex_no in grouped_by_dex
            if "forms" not in result.get(str(dex_no), {})
        ]
    print(f"処理対象: {len(target_dex_nos)} dexNo（--force: {args.force}）")

    if args.dry_run:
        target_dex_nos = target_dex_nos[:10]
        print(f"[DRY-RUN] 先頭 {len(target_dex_nos)} dexNo のみ処理します（保存なし）")

    # --- カテゴリ別カウンタ ---
    category_counts: dict[str, int] = defaultdict(int)
    total_forms_written = 0
    total_collapsed = 0
    processed_dex_count = 0

    for dex_no in target_dex_nos:
        dex_key = str(dex_no)
        source_entries = grouped_by_dex[dex_no]

        if dex_key not in result:
            names = "".join(f"「{p['pokemonName']}」" for p in source_entries)
            print(f"[WARN] No.{dex_no} ({names}) が all.json に存在しません。スキップ。")
            continue

        forms_out, collapsed = merge_forms_for_dex(dex_no, source_entries, category_counts)

        result[dex_key]["forms"] = forms_out
        total_forms_written += len(forms_out)
        total_collapsed += collapsed
        processed_dex_count += 1

        if args.dry_run:
            print(f"\n  No.{dex_no}: {len(forms_out)} フォーム")
            for fe in forms_out:
                print(f"    - {fe}")

    # --- 保存 ---
    if not args.dry_run:
        _save(result)
        print(f"\n完了: 書き込みフォーム数 {total_forms_written} 件 → {OUTPUT_PATH}")
    else:
        print(f"\n[DRY-RUN] 完了: 書き込みフォーム数（表示のみ） {total_forms_written} 件")

    # カテゴリ別サマリー
    print("\nカテゴリ別追加件数:")
    for cat in sorted(category_counts):
        print(f"  {cat}: {category_counts[cat]} 件")

    # 全体サマリー
    print(
        f"\nサマリー: 処理した dexNo 数 {processed_dex_count} 件 / "
        f"書き込んだ forms 総数 {total_forms_written} 件 / "
        f"畳んだ件数 {total_collapsed} 件"
    )


if __name__ == "__main__":
    main()
