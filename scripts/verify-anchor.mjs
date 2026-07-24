// 配信正本化 Phase B「anchor 一致による凍結id」の監査CLI。
//
// distributions/gen5.json〜gen9.json（champions.json・schema.json は除外。champions は
// 手編集CH空間なのでanchor検証の対象外）を読み、scripts/anchor.mjs の anchorKey で
// グループ化し、同一anchorに複数entryがぶら下がる「衝突」を列挙する。
//
// 併せて EXPECTED（総数667 / ユニークanchor630 / 衝突グループ19 / 衝突entry56）との
// 差分を回帰ガードとして表示する。ズレていても throw はしない（レポートツールなので exit 0 のまま）。
//
// 第1引数に staged L2 ファイル（{entries:[...]} 形状。scripts/scrape-to-l2.mjs の出力）を渡すと、
// staged内のintra-batch多重（同一anchorがstaged内に複数）と、既存indexとのoverlap集計も追加で行う。
//
// 実行: node scripts/verify-anchor.mjs [staged-l2.json]

import fs from "node:fs";
import path from "node:path";
import { anchorKey, buildAnchorIndex } from "./anchor.mjs";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

// 回帰ガードの期待値（2026-07時点の distributions/gen5〜gen9 実測値）
const EXPECTED = {
  total: 667,
  uniqueAnchors: 630,
  collisionGroups: 19,
  collisionEntries: 56,
};

const GEN_FILES = ["gen5.json", "gen6.json", "gen7.json", "gen8.json", "gen9.json"];

// entry（オブジェクト参照）→ 由来ファイル名。entry自体は汚さず別Mapで持つ（表示用）。
const fileNameByEntry = new Map();

const allEntries = [];
for (const fileName of GEN_FILES) {
  const payload = readJson(path.join("distributions", fileName));
  for (const entry of payload.entries) {
    fileNameByEntry.set(entry, fileName);
    allEntries.push(entry);
  }
}

const index = buildAnchorIndex(allEntries);
const collisionGroups = [...index.values()].filter((group) => group.length >= 2);
const collisionEntryCount = collisionGroups.reduce((sum, group) => sum + group.length, 0);

// anchorの人間可読表示（先頭メンバーのフィールドから組み立てる。anchorKeyの生文字列はSOH区切りで読みにくいため）
function anchorDisplay(entry) {
  const games = Array.isArray(entry.games) ? [...entry.games].sort().join("+") : "";
  return `dexNo=${entry.dexNo} startDate=${entry.startDate} games=[${games}] method=${entry.distributionMethod}`;
}

function memberLine(entry, fileName) {
  const form = entry.form ? `（${entry.form}）` : "";
  return `  ${fileName} ${entry.id} ${entry.pokemonName}${form} ev="${entry.eventName}"`;
}

console.log("=== anchor集計（distributions/gen5〜gen9。champions.json は対象外） ===");
console.log(`総entry数: ${allEntries.length}`);
console.log(`ユニークanchor数: ${index.size}`);
console.log(`衝突グループ数（メンバー2件以上）: ${collisionGroups.length}`);
console.log(`衝突に巻き込まれるentry数: ${collisionEntryCount}`);

if (collisionGroups.length > 0) {
  console.log("\n=== 衝突グループ詳細 ===");
  for (const group of collisionGroups) {
    console.log(`\n[${group.length}件] ${anchorDisplay(group[0])}`);
    for (const entry of group) {
      console.log(memberLine(entry, fileNameByEntry.get(entry)));
    }
  }
}

// ---- 期待値アサーション（回帰ガード。throwせず表示のみ＝レポートツール） ----
const mismatches = [];
if (allEntries.length !== EXPECTED.total) {
  mismatches.push(`総数期待${EXPECTED.total}/実測${allEntries.length}`);
}
if (index.size !== EXPECTED.uniqueAnchors) {
  mismatches.push(`ユニークanchor期待${EXPECTED.uniqueAnchors}/実測${index.size}`);
}
if (collisionGroups.length !== EXPECTED.collisionGroups) {
  mismatches.push(`衝突グループ期待${EXPECTED.collisionGroups}/実測${collisionGroups.length}`);
}
if (collisionEntryCount !== EXPECTED.collisionEntries) {
  mismatches.push(`衝突entry期待${EXPECTED.collisionEntries}/実測${collisionEntryCount}`);
}

console.log("\n=== 期待値チェック ===");
if (mismatches.length === 0) {
  console.log("期待値と一致（総数/ユニークanchor/衝突グループ/衝突entry すべてOK）");
} else {
  console.log(`⚠️ 期待値と不一致（${mismatches.join(", ")}）`);
}

// ---- staged L2ファイル（第1引数）が指定された場合の追加監査 ----
const [, , stagedPathArg] = process.argv;
if (stagedPathArg) {
  const stagedPayload = JSON.parse(fs.readFileSync(path.resolve(stagedPathArg), "utf8"));
  const stagedEntries = Array.isArray(stagedPayload.entries) ? stagedPayload.entries : [];
  const stagedIndex = buildAnchorIndex(stagedEntries);

  console.log(`\n=== staged監査: ${stagedPathArg} ===`);
  console.log(`staged総entry数: ${stagedEntries.length}`);
  console.log(`stagedユニークanchor数: ${stagedIndex.size}`);

  // intra-batch多重（staged内で同一anchorが2件以上）
  const intraBatchGroups = [...stagedIndex.values()].filter((group) => group.length >= 2);
  console.log(`\nintra-batch多重（staged内で同一anchorが2件以上）: ${intraBatchGroups.length}グループ`);
  for (const group of intraBatchGroups) {
    console.log(`\n[${group.length}件] ${anchorDisplay(group[0])}`);
    for (const entry of group) {
      const form = entry.form ? `（${entry.form}）` : "";
      console.log(`  ${entry.id} ${entry.pokemonName}${form} ev="${entry.eventName}"`);
    }
  }

  // 既存index（gen5〜gen9）とのoverlap集計
  let overlapCount = 0;
  let newSingleCount = 0;
  let newMultipleCount = 0;
  for (const [key, group] of stagedIndex.entries()) {
    if (index.has(key)) {
      overlapCount += 1;
    } else if (group.length >= 2) {
      newMultipleCount += 1;
    } else {
      newSingleCount += 1;
    }
  }
  const newCount = newSingleCount + newMultipleCount;

  console.log("\n=== staged vs 既存index ===");
  console.log(`既存indexと一致（overlap）: ${overlapCount}anchor`);
  console.log(
    `新規anchor: ${newCount}anchor（内訳: staged単独=${newSingleCount} / staged内intra-batch多重=${newMultipleCount}）`
  );
}
