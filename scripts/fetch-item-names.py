#!/usr/bin/env python3
"""trainers で使用する持ち物だけの英日対比表を生成する。

実行: uv run python scripts/fetch-item-names.py
同じ CSV・trainers 入力からは常に同じ JSON を生成する。
"""

import csv
import io
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
TRAINER_FILES = ("trainers/elite-four.json", "trainers/gym-leaders.json")
FALLBACK_NAMES = {"Crabominite", "Hawluchanite", "Chesnaughtite", "Lucarionite Z"}
DESCRIPTION = "もちものの英日対比表。収録範囲は trainers データ（四天王・ジムリーダー）で実際に使われている持ち物に限る。日本語名は PokeAPI のゲームデータ由来の公式名を正とし、PokeAPI に日本語名が無い ZA の新メガストーン4件のみ trainers データ側の表記を採用した。"
SOURCE = "PokeAPI data v2 CSV（items.csv / item_names.csv）と trainers/elite-four.json・gym-leaders.json の (item, item_ja) ペア111種の突き合わせ（2026-11-15）"


def fetch_csv(filename: str) -> list[dict[str, str]]:
    with urlopen(CSV_BASE + filename, timeout=60) as response:
        return list(csv.DictReader(io.StringIO(response.read().decode("utf-8"))))


def normalize(name: str) -> str:
    return name.replace("’", "'")


def trainer_pairs() -> set[tuple[str, str | None]]:
    pairs = set()
    for filename in TRAINER_FILES:
        data = json.loads((ROOT / filename).read_text(encoding="utf-8"))
        for trainer in data["trainers"]:
            for party in trainer["parties"]:
                for pokemon in party["team"]:
                    if pokemon.get("item"):
                        pairs.add((pokemon["item"], pokemon.get("item_ja")))
    return pairs


def main() -> None:
    items = {int(row["id"]): row["identifier"] for row in fetch_csv("items.csv")}
    names = {}
    english_index = {}
    for row in fetch_csv("item_names.csv"):
        item_id = int(row["item_id"])
        language = row["local_language_id"]
        if language in {"1", "9"}:
            names.setdefault(item_id, {})[language] = row["name"]
        if language == "9":
            english_index.setdefault(normalize(row["name"]), set()).add(item_id)

    pairs = trainer_pairs()
    selected = {}
    unmatched = []
    missing_ja = []
    fallbacks = []
    for en, trainer_ja in sorted(pairs, key=lambda pair: (pair[0], pair[1] or "")):
        candidates = english_index.get(normalize(en), set())
        # Zクリスタルは同じ英語名で --held / --bag の2レコードがある。
        # trainers の持ち物なので、バッグ用ではなく持たせる用を選ぶ。
        if len(candidates) > 1:
            held = {item_id for item_id in candidates if items[item_id].endswith("--held")}
            if len(held) == 1:
                candidates = held
        if len(candidates) != 1:
            unmatched.append((en, trainer_ja, sorted(candidates)))
            continue
        item_id = next(iter(candidates))
        localized = names[item_id]
        ja = localized.get("1")
        if not ja and localized["9"] in FALLBACK_NAMES and trainer_ja:
            ja = trainer_ja
            fallbacks.append((en, ja))
        if not ja:
            missing_ja.append((en, trainer_ja))
            continue
        entry = {"en": localized["9"], "ja": ja, "id": item_id}
        if item_id in selected and selected[item_id] != entry:
            raise ValueError(f"trainers の日本語名が競合: {en}")
        selected[item_id] = entry

    result = {"_description": DESCRIPTION, "_source": SOURCE}
    for item_id, entry in sorted(selected.items()):
        result[items[item_id]] = entry
    path = ROOT / "mappings/items.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {len(selected)}件生成（trainers: {len(pairs)}ペア）")
    print(f"未特定・エントリ除外: {len(unmatched)}件")
    for en, ja, candidates in unmatched:
        print(f"  {en} / {ja}（候補ID: {candidates}）")
    print(f"日本語名なし・エントリ除外: {len(missing_ja)}件")
    for en, ja in missing_ja:
        print(f"  {en} / {ja}")
    print(f"trainers の日本語名を採用: {len(fallbacks)}件")
    for en, ja in fallbacks:
        print(f"  {en} / {ja}")


if __name__ == "__main__":
    main()
