# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""
forms/special-forms.json の regional フォームの特性を PokeAPI と突き合わせる。

**読み取り専用。正本には一切書き込まない**（差分を出すだけ）。
投入は人間が差分を見てから行う。

なぜ検証だけにしてあるか:
  regional の formAbilities は「PokeAPI から種まき済み」と docs に書いてあるが、
  種まきがいつ・どの範囲で行われたかの記録が無い。**埋まっていること**と
  **正しいこと**は別なので、まず突き合わせる。

  あわせて `formHiddenAbility` が空の8件について、「隠れ特性が本当に無い」のか
  「入れ忘れ」なのかを機械で判定する。空欄が正しいかどうかを人間の記憶で
  決めない（正本: .claude/rules/data-canonical-placement.md）。

実行:
  uv run scripts/verify-regional-abilities.py
  uv run scripts/verify-regional-abilities.py --json   # 機械可読

⚠ PokeAPI は種まき用。実行のたびに取り直す構造にはしない。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
FORMS = ROOT / "forms" / "special-forms.json"
ABILITIES = ROOT / "abilities" / "all.json"
API = "https://pokeapi.co/api/v2/pokemon"

# regionName → PokeAPI のフォーム接尾辞
REGION_SUFFIX = {
    "アローラのすがた": "alola",
    "ガラルのすがた": "galar",
    "ヒスイのすがた": "hisui",
    "パルデアのすがた": "paldea",
}


def load_ability_map() -> dict[str, str]:
    """PokeAPI の ability slug → 日本語名。"""
    out: dict[str, str] = {}
    for a in json.loads(ABILITIES.read_text(encoding="utf-8")):
        en = (a.get("name_en") or "").strip()
        if not en:
            continue
        slug = en.lower().replace(" ", "-").replace("'", "")
        out[slug] = a["name_ja"]
    return out


# 地方フォームがさらに枝分かれするもの。日本語のフォーム名に含まれる語 → PokeAPI の末尾。
# ⚠ `-galar` `-paldea` で終わらない variety があるので endswith では拾えない
#   （tauros-paldea-combat / darmanitan-galar-zen など）。
SUBFORM_HINT = {
    "コンバット種": "combat",
    "ブレイズ種": "blaze",
    "ウォーター種": "aqua",   # PokeAPI は water ではなく aqua
    "ダルマモード": "zen",
}
# ⚠ 末尾一致では拾えない。ケンタロスは `tauros-paldea-combat-breed` のように
#   さらに `-breed` が付く。部分一致で見る。


def fetch_forms(dex: int, suffix: str, form_name: str) -> tuple[list[str], str | None, str] | None:
    """(通常特性 slug の配列, 隠れ特性 slug or None, 使ったキー) を返す。"""
    r = requests.get(f"https://pokeapi.co/api/v2/pokemon-species/{dex}", timeout=20)
    if r.status_code != 200:
        return None
    species = r.json()
    cands = [v["pokemon"]["name"] for v in species.get("varieties", [])
             if f"-{suffix}" in v["pokemon"]["name"]]
    if not cands:
        return None
    target = None
    if len(cands) == 1:
        target = cands[0]
    else:
        # 日本語フォーム名に枝分かれの語があればそれで選ぶ
        for word, tail in SUBFORM_HINT.items():
            if word in form_name:
                target = next((c for c in cands if tail in c), None)
                break
        if target is None:
            # 枝分かれの語が無いものは基本形（-standard か、接尾辞ちょうど）
            target = next((c for c in cands if c.endswith("-standard")), None) \
                or next((c for c in cands if c.endswith(f"-{suffix}")), None)
    if not target:
        return None
    r2 = requests.get(f"{API}/{target}", timeout=20)
    if r2.status_code != 200:
        return None
    normal, hidden = [], None
    for a in r2.json().get("abilities", []):
        slug = a["ability"]["name"]
        if a.get("is_hidden"):
            hidden = slug
        else:
            normal.append(slug)
    return normal, hidden, target


# formAbilities が空でも正しいカテゴリ。
# キョダイマックスとZワザ形態は**特性が変わらない**ので、原種の特性がそのまま効く。
# ここを区別しないと「空欄＝欠損」と数えてしまう（実際に 2026-08 の起票が
# 「欠損128件」→「実は76件」と2度ぶれた）。
ABILITY_OPTIONAL = {"gigantamax", "zmove"}

# formHiddenAbility は**どのカテゴリでも空になりうる**。
# メガ・ゲンシカイキ・キズナ変化は隠れ特性を持たない仕様で、
# 地方フォームにも隠れ特性が無いものが実在する（2026-08-10 に PokeAPI で
# 8件すべて「API側にも無い」ことを確認済み）。よって欠損として数えない。


def audit(data: dict) -> list[dict]:
    """ネットワークを使わずに、**本物の欠損だけ**を返す。"""
    gaps = []
    for p in data["pokemon"]:
        for f in p["forms"]:
            if f["category"] in ABILITY_OPTIONAL:
                continue
            if not f.get("formAbilities"):
                gaps.append({
                    "dexNo": p["dexNo"], "formName": f["formName"],
                    "category": f["category"], "debutGame": f.get("debutGame", ""),
                    "originalAbilities": p.get("originalAbilities") or [],
                })
    return gaps


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--audit", action="store_true",
                    help="ネットワークを使わず、本物の欠損だけを数える")
    ap.add_argument("--sleep", type=float, default=0.4)
    args = ap.parse_args()

    if args.audit:
        data = json.loads(FORMS.read_text(encoding="utf-8"))
        gaps = audit(data)
        if args.json:
            print(json.dumps(gaps, ensure_ascii=False, indent=2))
            sys.exit(1 if gaps else 0)
        total = sum(len(p["forms"]) for p in data["pokemon"])
        skipped = sum(1 for p in data["pokemon"] for f in p["forms"]
                      if f["category"] in ABILITY_OPTIONAL)
        print(f"フォーム {total} 件 / 特性が要らないカテゴリ {skipped} 件"
              f"（{'・'.join(sorted(ABILITY_OPTIONAL))}）を除外\n")
        if not gaps:
            print("formAbilities の欠損はありません")
            sys.exit(0)
        print(f"■ formAbilities が空（{len(gaps)} 件）")
        for g in gaps:
            print(f"   [{g['dexNo']:>4}] {g['formName']:20s} {g['category']:9s} "
                  f"debut={g['debutGame']:12s} 原種={'/'.join(g['originalAbilities'])}")
        sys.exit(1)

    amap = load_ability_map()
    data = json.loads(FORMS.read_text(encoding="utf-8"))

    rows = []
    for p in data["pokemon"]:
        for f in p["forms"]:
            if f["category"] != "regional":
                continue
            suffix = REGION_SUFFIX.get(f.get("regionName", ""))
            if not suffix:
                rows.append({"dexNo": p["dexNo"], "name": f["formName"],
                             "region": f.get("regionName", ""), "verdict": "region_unknown"})
                continue
            got = fetch_forms(p["dexNo"], suffix, f["formName"])
            time.sleep(args.sleep)
            if not got:
                rows.append({"dexNo": p["dexNo"], "name": f["formName"],
                             "region": f["regionName"], "verdict": "not_found"})
                continue
            normal, hidden, used = got
            api_normal = [amap.get(s, f"?{s}") for s in normal]
            api_hidden = amap.get(hidden, f"?{hidden}") if hidden else ""
            cur_normal = list(f.get("formAbilities") or [])
            cur_hidden = f.get("formHiddenAbility") or ""

            if cur_normal == api_normal and cur_hidden == api_hidden:
                verdict = "match"
            elif not cur_hidden and not api_hidden and cur_normal == api_normal:
                verdict = "match"
            elif not cur_hidden and api_hidden:
                verdict = "hidden_missing"
            elif cur_hidden and not api_hidden:
                verdict = "hidden_extra"
            else:
                verdict = "diff"
            rows.append({
                "dexNo": p["dexNo"], "name": f["formName"], "region": f["regionName"],
                "apiKey": used, "verdict": verdict,
                "local": {"normal": cur_normal, "hidden": cur_hidden},
                "api": {"normal": api_normal, "hidden": api_hidden},
            })

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return

    counts: dict[str, int] = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    print(f"regional フォーム {len(rows)} 件を PokeAPI と突き合わせました\n")
    for k in sorted(counts):
        print(f"  {k:16s} {counts[k]:3d}")
    print()
    for r in rows:
        if r["verdict"] == "match":
            continue
        print(f"■ [{r['dexNo']}] {r['name']}（{r['region']}）… {r['verdict']}")
        if "local" in r:
            print(f"    ローカル: 通常={r['local']['normal']} 隠れ={r['local']['hidden']!r}")
            print(f"    PokeAPI : 通常={r['api']['normal']} 隠れ={r['api']['hidden']!r}")

    bad = [r for r in rows if r["verdict"] not in ("match",)]
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
