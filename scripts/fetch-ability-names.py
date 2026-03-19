# /// script
# requires-python = ">=3.11"
# dependencies = ["requests", "tqdm"]
# ///
"""
PokeAPI から全特性（ability）の英語名を取得して
abilities/all.json の name_en を埋めるスクリプト。

実行方法:
  uv run scripts/fetch-ability-names.py

オプション:
  --force    既にname_enが埋まっていても再取得して上書き
  --dry-run  保存せずに先頭10件の結果を表示
"""

import json
import time
import sys
from pathlib import Path
import requests
from tqdm import tqdm

POKEAPI_BASE = "https://pokeapi.co/api/v2"
SLEEP_SEC = 0.3


def get(url: str) -> dict | None:
    """PokeAPI から JSON を取得。エラー時は None を返却。"""
    try:
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print(f"\n[ERROR] {url}: {e}")
        return None


def main():
    force = "--force" in sys.argv
    dry_run = "--dry-run" in sys.argv

    abilities_path = Path(__file__).parent.parent / "abilities" / "all.json"

    # 1. abilities/all.json を読み込み
    print(f"Reading {abilities_path}...")
    with open(abilities_path, encoding="utf-8") as f:
        abilities = json.load(f)

    # 2. 処理対象を決定
    if force:
        targets = abilities
        print(f"[--force] 全 {len(targets)} 件を再取得します")
    else:
        targets = [a for a in abilities if a.get("name_en") == ""]
        print(f"name_en が未埋めの {len(targets)} 件を処理します")

    # 3. --dry-run なら先頭10件に絞る
    if dry_run:
        targets = targets[:10]
        print(f"[--dry-run] 先頭 {len(targets)} 件のみ表示します")

    # 4. tqdmループでAPIコール
    for ability in tqdm(targets, desc="Fetching ability names"):
        ability_id = ability.get("id")
        url = f"{POKEAPI_BASE}/ability/{ability_id}"
        data = get(url)

        if data and "names" in data:
            for name_entry in data["names"]:
                if name_entry.get("language", {}).get("name") == "en":
                    ability["name_en"] = name_entry.get("name", "")
                    break

        time.sleep(SLEEP_SEC)

    # 5. 保存（--dry-run でなければ）
    if not dry_run:
        print(f"\nSaving {abilities_path}...")
        with open(abilities_path, "w", encoding="utf-8") as f:
            json.dump(abilities, f, ensure_ascii=False, indent=2)
        print("Done!")
    else:
        print("\n[--dry-run] 保存をスキップしました")
        print("\n先頭10件のプレビュー:")
        for ability in targets[:10]:
            print(f"  ID {ability.get('id')}: {ability.get('name_ja')} -> {ability.get('name_en')}")


if __name__ == "__main__":
    main()
