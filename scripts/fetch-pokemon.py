# /// script
# requires-python = ">=3.11"
# dependencies = ["requests", "tqdm"]
# ///
"""
PokeAPI から全ポケモンのマスターデータを取得して
pokemon/all.json に保存するスクリプト。

取得フィールド: no, name_ja, name_en, gen, types(日本語), is_legendary, is_mythical

実行方法:
  uv run scripts/fetch-pokemon.py

途中中断しても再開可能（10件ごとに中間保存）。

ZA等のPokeAPI未対応ポケモンは pokemon/all.json に手動追記:
  "1026": {"no": 1026, "name_ja": "???", "name_en": "???", "gen": 10, "types": [], "is_legendary": false, "is_mythical": false}
"""

import json
import time
from pathlib import Path

import requests
from tqdm import tqdm

POKEAPI_BASE = "https://pokeapi.co/api/v2"
OUTPUT_PATH = Path(__file__).parent.parent / "pokemon" / "all.json"
TOTAL_POKEMON = 1025  # Gen1〜Gen9（SVまで）
SLEEP_SEC = 0.3

TYPE_JA = {
    "normal": "ノーマル", "fire": "ほのお", "water": "みず", "electric": "でんき",
    "grass": "くさ", "ice": "こおり", "fighting": "かくとう", "poison": "どく",
    "ground": "じめん", "flying": "ひこう", "psychic": "エスパー", "bug": "むし",
    "rock": "いわ", "ghost": "ゴースト", "dragon": "ドラゴン", "dark": "あく",
    "steel": "はがね", "fairy": "フェアリー",
}

GEN_NUM = {
    "generation-i": 1, "generation-ii": 2, "generation-iii": 3, "generation-iv": 4,
    "generation-v": 5, "generation-vi": 6, "generation-vii": 7, "generation-viii": 8,
    "generation-ix": 9,
}


def get(url: str) -> dict | None:
    try:
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print(f"\n[ERROR] {url}: {e}")
        return None


def is_complete(entry: dict) -> bool:
    return all(k in entry for k in ["no", "name_ja", "name_en", "gen", "types", "is_legendary", "is_mythical"])


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # 既存データ読み込み（差分取得・再開に対応）
    result: dict[str, dict] = {}
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            result = json.load(f)
        print(f"既存データ: {len(result)} 件")

    missing_ids = [i for i in range(1, TOTAL_POKEMON + 1) if not is_complete(result.get(str(i), {}))]
    print(f"取得対象: {len(missing_ids)} 件（最大 {len(missing_ids) * 2} APIコール、約 {len(missing_ids) * 2 * SLEEP_SEC / 60:.0f} 分）")

    for pokemon_id in tqdm(missing_ids, desc="Fetching"):
        entry: dict = result.get(str(pokemon_id), {"no": pokemon_id})

        # pokemon-species: 名前・世代・伝説/幻
        if not all(k in entry for k in ["name_ja", "name_en", "gen", "is_legendary", "is_mythical"]):
            data = get(f"{POKEAPI_BASE}/pokemon-species/{pokemon_id}")
            if data:
                names = {n["language"]["name"]: n["name"] for n in data["names"]}
                entry["name_ja"] = names.get("ja", "")
                entry["name_en"] = names.get("en", "")
                entry["gen"] = GEN_NUM.get(data["generation"]["name"], 0)
                entry["is_legendary"] = data["is_legendary"]
                entry["is_mythical"] = data["is_mythical"]
            time.sleep(SLEEP_SEC)

        # pokemon: タイプ（日本語）
        if "types" not in entry:
            data = get(f"{POKEAPI_BASE}/pokemon/{pokemon_id}")
            if data:
                entry["types"] = [TYPE_JA.get(t["type"]["name"], t["type"]["name"]) for t in data["types"]]
            time.sleep(SLEEP_SEC)

        result[str(pokemon_id)] = entry

        # 10件ごとに中間保存
        if pokemon_id % 10 == 0:
            _save(result)

    _save(result)
    print(f"\n完了: {len(result)} 件 → {OUTPUT_PATH}")


def _save(result: dict) -> None:
    sorted_result = {k: result[k] for k in sorted(result, key=lambda x: int(x))}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted_result, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
