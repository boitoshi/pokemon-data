# /// script
# requires-python = ">=3.11"
# dependencies = ["requests", "tqdm"]
# ///
"""
PokeAPI から各フォームの英語名を取得して
pokemon/all.json の form_name_en を埋めるスクリプト。

実行順: fetch-forms.py を先に実行してから本スクリプトを実行すること。

実行方法:
  uv run scripts/fetch-form-names-en.py

オプション:
  --force    既にform_name_enが埋まっていても再取得して上書き
  --dry-run  保存せずに処理対象のスラッグ一覧を表示
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests
from tqdm import tqdm

POKEAPI_BASE = "https://pokeapi.co/api/v2"
OUTPUT_PATH = Path(__file__).parent.parent / "pokemon" / "all.json"
SLEEP_SEC = 0.3

# M-dimension限定フォーム（PokeAPI未収録）
MANUAL_FORM_NAMES_EN: dict[tuple[int, str], str] = {
    (26, "mega-x"): "Mega Raichu X",
    (26, "mega-y"): "Mega Raichu Y",
    (358, "mega"): "Mega Chimecho",
    (359, "mega-z"): "Mega Absol Z",
    (398, "mega"): "Mega Staraptor",
    (448, "mega-z"): "Mega Lucario Z",
    (485, "mega"): "Mega Heatran",
    (623, "mega"): "Mega Golurk",
    (678, "mega"): "Mega Meowstic",
    (740, "mega"): "Mega Crabominable",
    (768, "mega"): "Mega Golisopod",
    (801, "mega"): "Mega Magearna",
    (807, "mega"): "Mega Zeraora",
    (952, "mega"): "Mega Scovillain",
    (998, "mega"): "Mega Baxcalibur",
    # PokeAPIスラッグがform_idと一致しないケース
    (849, "gmax"): "Gigantamax Toxtricity",
    # ウーラオスgmax: PokeAPI slug は urshifu-single-strike-gmax / urshifu-rapid-strike-gmax
    # （form_id が gmax-* なので slug が逆順になってしまうため手動登録）
    (892, "gmax-single-strike"): "Gigantamax Urshifu (Single Strike Style)",
    (892, "gmax-rapid-strike"): "Gigantamax Urshifu (Rapid Strike Style)",
}


def get(url: str) -> dict | None:
    try:
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print(f"\n[ERROR] {url}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="PokeAPI から各フォームの英語名を取得して pokemon/all.json の form_name_en を埋める"
    )
    parser.add_argument("--force", action="store_true", help="既にform_name_enが埋まっていても再取得して上書き")
    parser.add_argument("--dry-run", action="store_true", help="保存せずに処理対象のスラッグ一覧を表示")
    args = parser.parse_args()

    # all.json を読み込み
    if not OUTPUT_PATH.exists():
        print(f"[ERROR] {OUTPUT_PATH} が見つかりません")
        sys.exit(1)

    with open(OUTPUT_PATH, encoding="utf-8") as f:
        pokemon_data: dict[str, dict] = json.load(f)

    # 処理対象フォームを収集
    forms_to_process: list[tuple[int, str, str, str]] = []  # (pokemon_no, form_id, name_en, current_form_name_en)

    for pokemon_str, data in pokemon_data.items():
        if "forms" not in data:
            continue

        pokemon_no = data["no"]
        name_en = data["name_en"]

        for form in data["forms"]:
            form_id = form["form_id"]
            form_name_en = form.get("form_name_en", "")

            # --force なし: form_name_en が空の場合のみ処理
            # --force あり: 全フォームを処理
            if args.force or form_name_en == "":
                forms_to_process.append((pokemon_no, form_id, name_en, form_name_en))

    print(f"処理対象フォーム: {len(forms_to_process)} 件")

    if args.dry_run:
        print("\n[DRY-RUN] 処理対象スラッグ一覧:")
        for pokemon_no, form_id, name_en, _ in forms_to_process:
            base = name_en.lower().replace("'", "").replace("\u2019", "").replace(".", "").replace(" ", "-")
            slug = f"{base}-{form_id}"
            print(f"  ({pokemon_no}, {form_id}): {slug}")
        print(f"\n合計 {len(forms_to_process)} 件")
        return

    # tqdm ループで各フォームを処理
    updated_count = 0
    warned_count = 0

    for pokemon_no, form_id, name_en, _ in tqdm(forms_to_process, desc="Processing"):
        form_name_en = ""
        base = name_en.lower().replace("'", "").replace("\u2019", "").replace(".", "").replace(" ", "-")
        slug = f"{base}-{form_id}"

        # MANUAL_FORM_NAMES_EN を確認（APIコールなし）
        if (pokemon_no, form_id) in MANUAL_FORM_NAMES_EN:
            form_name_en = MANUAL_FORM_NAMES_EN[(pokemon_no, form_id)]
        else:
            # PokeAPI から取得
            data = get(f"{POKEAPI_BASE}/pokemon-form/{slug}")
            if data:
                # names から language.name == "en" の name を取得
                names = {n["language"]["name"]: n["name"] for n in data.get("names", [])}
                form_name_en = names.get("en", "")
            else:
                print(f"\n[WARN] 未収録: {slug}")
                warned_count += 1

            time.sleep(SLEEP_SEC)

        # all.json を更新
        pokemon_str = str(pokemon_no)
        if pokemon_str in pokemon_data:
            for form in pokemon_data[pokemon_str]["forms"]:
                if form["form_id"] == form_id:
                    form["form_name_en"] = form_name_en
                    updated_count += 1
                    break

    # all.json を上書き保存
    sorted_result = {k: pokemon_data[k] for k in sorted(pokemon_data, key=lambda x: int(x))}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted_result, f, ensure_ascii=False, indent=2)

    print(f"\n完了: {updated_count} 件更新, {warned_count} 件警告 → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
