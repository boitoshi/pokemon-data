#!/usr/bin/env python3
"""PokeAPI の CSV を種として、わざ名の正本を生成する。

実行: uv run python scripts/fetch-move-names.py
同じ CSV 入力からは常に同じ JSON を生成する（取得日時は記録しない）。
"""

import csv
import io
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
DESCRIPTION = "わざ名の英日対比表。PokeAPI が公開するゲームデータ由来の公式名（英語・日本語）を種として取得し、正本として保持する。全937件（Zワザ・ダイマックスわざ・シャドウわざ等を含む）。"
SOURCE = "PokeAPI data v2 CSV（moves.csv / move_names.csv）。日本語名は local_language_id=1。検証: trainers データ（elite-four.json / gym-leaders.json）内の英日ペア（英名の表記ゆれを正規化して561種）と突き合わせ、照合できた559種は日本語名が全件一致。残り2種（Hi Jump Kick / Faint Attack）は旧世代の英名表記で、現行名で収録（2026-11-15）"


def fetch_csv(filename: str) -> list[dict[str, str]]:
    with urlopen(CSV_BASE + filename, timeout=60) as response:
        return list(csv.DictReader(io.StringIO(response.read().decode("utf-8"))))


def main() -> None:
    moves = fetch_csv("moves.csv")
    names = {}
    for row in fetch_csv("move_names.csv"):
        if row["local_language_id"] in {"1", "9"}:
            names.setdefault(int(row["move_id"]), {})[row["local_language_id"]] = row["name"]

    result = {"_description": DESCRIPTION, "_source": SOURCE}
    missing_ja = []
    for move in sorted(moves, key=lambda row: int(row["id"])):
        move_id = int(move["id"])
        localized = names.get(move_id, {})
        if not localized.get("1"):
            missing_ja.append(move["identifier"])
            continue
        if not localized.get("9"):
            raise ValueError(f"英語名なし: {move['identifier']}")
        result[move["identifier"]] = {
            "en": localized["9"], "ja": localized["1"], "id": move_id,
        }

    path = ROOT / "mappings/moves.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {len(result) - 2}件生成（CSV: {len(moves)}件）")
    print(f"日本語名なし・エントリ除外: {len(missing_ja)}件")
    for identifier in missing_ja:
        print(f"  {identifier}")


if __name__ == "__main__":
    main()
