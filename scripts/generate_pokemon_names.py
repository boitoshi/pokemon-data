"""pokemon/all.json から mappings/pokemon_names.json を生成する。

出力フォーマット:
  { "bulbasaur": {"en": "Bulbasaur", "ja": "フシギダネ", "dex_no": 1}, ... }

PokeAPIキー変換ルール（PokeAPI pokemon-species name に準拠）:
  "Mr. Mime"   → "mr-mime"    (ピリオド除去)
  "Sirfetch'd" → "sirfetchd"  (アポストロフィ除去)
  "Type: Null" → "type-null"  (コロン+スペース → ハイフン)
  "Flabébé"   → "flabebe"    (アクセント記号除去)
  "Nidoran♀"  → "nidoran-f"  (性別記号変換)
  "Nidoran♂"  → "nidoran-m"

Usage:
    uv run python scripts/generate_pokemon_names.py
    uv run python scripts/generate_pokemon_names.py --check  # キー変換の確認のみ
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
ALL_JSON = ROOT / "pokemon" / "all.json"
OUTPUT = ROOT / "mappings" / "pokemon_names.json"


def to_api_key(name: str) -> str:
    """英語表示名 → PokeAPI pokemon-species name (ケバブケース)。"""
    key = name

    # 性別記号（Nidoran♀ / Nidoran♂）
    key = key.replace("♀", "-f").replace("♂", "-m")

    # アクセント記号除去（Flabébé → Flabebe）
    key = key.replace("é", "e").replace("è", "e").replace("ê", "e")

    # アポストロフィ除去（Sirfetch'd, Farfetch'd）
    key = key.replace("\u2019", "").replace("\u2018", "").replace("'", "")

    # コロン＋スペース → ハイフン（Type: Null → type-null）
    key = key.replace(": ", "-")
    key = key.replace(":", "")

    # ピリオド＋スペース → スペース（Mr. Mime → Mr Mime）
    key = key.replace(". ", " ")
    # 末尾ピリオド除去（Mime Jr. → Mime Jr）
    key = key.rstrip(".")
    # 残りのピリオド除去
    key = key.replace(".", "")

    # スペース → ハイフン
    key = key.replace(" ", "-")

    # 小文字化
    key = key.lower()

    # 連続ハイフンを単一に
    key = re.sub(r"-+", "-", key)

    return key


# 既知の特殊ケース（自動変換の確認用）
EXPECTED_KEYS = {
    "Bulbasaur": "bulbasaur",
    "Mr. Mime": "mr-mime",
    "Mime Jr.": "mime-jr",
    "Ho-Oh": "ho-oh",
    "Sirfetch'd": "sirfetchd",
    "Farfetch'd": "farfetchd",
    "Type: Null": "type-null",
    "Flabébé": "flabebe",
    "Nidoran♀": "nidoran-f",
    "Nidoran♂": "nidoran-m",
    "Jangmo-o": "jangmo-o",
    "Porygon-Z": "porygon-z",
    "Tapu Koko": "tapu-koko",
    "Mr. Rime": "mr-rime",
}


def verify_conversion() -> bool:
    """既知の特殊ケースの変換結果を検証する。"""
    ok = True
    for name, expected in EXPECTED_KEYS.items():
        result = to_api_key(name)
        status = "✅" if result == expected else "❌"
        print(f"  {status}  {name:20s} → {result}  (expected: {expected})")
        if result != expected:
            ok = False
    return ok


def main() -> None:
    check_only = "--check" in sys.argv

    print("🔍 キー変換テスト...")
    if not verify_conversion():
        print("\n❌ 変換エラーがあります。スクリプトを修正してください。")
        sys.exit(1)
    print("✅ 全ての既知ケースが正常に変換されました\n")

    if check_only:
        return

    # all.json を読み込んで変換
    all_pokemon: dict = json.loads(ALL_JSON.read_text(encoding="utf-8"))

    mapping: dict[str, dict] = {}
    for entry in all_pokemon.values():
        name_en: str = entry["name_en"]
        name_ja: str = entry["name_ja"]
        dex_no: int = entry["no"]

        api_key = to_api_key(name_en)
        mapping[api_key] = {"en": name_en, "ja": name_ja, "dex_no": dex_no}

    OUTPUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ pokemon_names.json を生成しました（{len(mapping)}件）")
    print(f"   出力先: {OUTPUT}")


if __name__ == "__main__":
    main()
