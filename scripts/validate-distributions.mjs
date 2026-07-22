// 配信ポケモン正本の検証
//
// distributions/schema.json の意味的制約と distributions/*.json（gen5〜gen9, champions があれば含む）を
// マスターデータ（pokemon/all.json, games/titles.json, mappings/*.json, abilities/all.json）と突き合わせて検証する。
//
// ハード違反: throw して exit 1
// ドリフト系（値集合が古い等）: warning として集計・表示するのみ（失敗させない）
//
// 実行: node scripts/validate-distributions.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const pokemon = readJson("pokemon/all.json");
const titles = readJson("games/titles.json");
const abilities = readJson("abilities/all.json");
const natures = readJson("mappings/natures.json");
const ribbonsMap = readJson("mappings/ribbons.json");
const regionsMap = readJson("mappings/regions.json");
const methodsMap = readJson("mappings/distribution-methods.json");
const ballsMap = readJson("mappings/balls.json");

const titleIds = new Set(titles.map((t) => t.id));
const abilityNames = new Set(abilities.map((a) => a.name_ja));
const natureNames = new Set(natures.map((n) => n.name_ja));
const ribbonValues = new Set(Object.values(ribbonsMap.ribbons ?? ribbonsMap));
const regionValues = new Set(Object.values(regionsMap));
const methodValues = new Set(Object.values(methodsMap));
const ballValues = new Set(Object.values(ballsMap));

const distributionsDir = path.join(root, "distributions");
const files = fs
  .readdirSync(distributionsDir)
  .filter((f) => f.endsWith(".json") && f !== "schema.json")
  .sort();

if (files.length === 0) {
  throw new Error("distributions/ に検証対象の *.json が見つかりません");
}

const GEN_PREFIX = {
  gen1: "01",
  gen2: "02",
  gen3: "03",
  gen4: "04",
  gen5: "05",
  gen6: "06",
  gen7: "07",
  gen8: "08",
  gen9: "09",
  champions: "CH",
};

const warnings = [];
function warn(type, detail) {
  warnings.push({ type, detail });
}

const fileSummaries = [];
const idToFiles = new Map(); // id -> [fileName,...] （ファイル間重複検出用）

for (const fileName of files) {
  const filePath = path.join(distributionsDir, fileName);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // ---- 封筒 ----
  if (payload.schemaVersion !== 1) {
    throw new Error(`${fileName}: schemaVersion は 1 である必要があります (got: ${payload.schemaVersion})`);
  }
  if (typeof payload.dataset !== "string" || !/^(gen[1-9]|champions)$/.test(payload.dataset)) {
    throw new Error(`${fileName}: dataset が不正です (got: ${payload.dataset})`);
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error(`${fileName}: entries は配列である必要があります`);
  }

  const dataset = payload.dataset;
  const idsInFile = new Set();

  for (const [index, entry] of payload.entries.entries()) {
    const where = `${fileName}#${index} (id=${entry.id ?? "?"})`;

    // ---- 必須フィールド ----
    for (const key of ["id", "dexNo", "pokemonName", "games", "eventName", "distributionMethod", "startDate"]) {
      if (!(key in entry)) {
        throw new Error(`${where}: 必須フィールド "${key}" がありません`);
      }
    }
    if (!Array.isArray(entry.games) || entry.games.length < 1) {
      throw new Error(`${where}: games は長さ1以上の配列である必要があります`);
    }

    // ---- id 一意性（ファイル内） ----
    if (idsInFile.has(entry.id)) {
      throw new Error(`${where}: id "${entry.id}" がファイル内で重複しています`);
    }
    idsInFile.add(entry.id);

    // ---- id 重複（ファイル間） ----
    if (!idToFiles.has(entry.id)) idToFiles.set(entry.id, []);
    idToFiles.get(entry.id).push(fileName);

    // ---- dexNo / pokemonName ----
    const master = pokemon[String(entry.dexNo)];
    if (!master) {
      throw new Error(`${where}: dexNo ${entry.dexNo} が pokemon/all.json に存在しません`);
    }
    if (entry.pokemonName !== master.name_ja) {
      throw new Error(
        `${where}: pokemonName "${entry.pokemonName}" が pokemon/all.json の name_ja "${master.name_ja}" と一致しません`
      );
    }

    // ---- games ----
    for (const gameId of entry.games) {
      if (!titleIds.has(gameId)) {
        throw new Error(`${where}: games の "${gameId}" が games/titles.json の id に存在しません`);
      }
    }

    // ---- 日付 ----
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(entry.startDate)) {
      throw new Error(`${where}: startDate "${entry.startDate}" が YYYY-MM-DD 形式ではありません`);
    }
    if ("endDate" in entry) {
      if (!dateRe.test(entry.endDate)) {
        throw new Error(`${where}: endDate "${entry.endDate}" が YYYY-MM-DD 形式ではありません`);
      }
      if (entry.startDate > entry.endDate) {
        throw new Error(`${where}: startDate "${entry.startDate}" が endDate "${entry.endDate}" より後です`);
      }
    }

    // ---- shiny ----
    if ("shiny" in entry && entry.shiny !== "fixed" && entry.shiny !== "conditional") {
      throw new Error(`${where}: shiny "${entry.shiny}" は fixed|conditional のいずれかである必要があります`);
    }

    // ---- ivs / ivsGuaranteed 排他 ----
    if ("ivs" in entry && "ivsGuaranteed" in entry) {
      throw new Error(`${where}: ivs と ivsGuaranteed は同時に存在できません`);
    }

    // ==== ここから warning（集計のみ） ====

    // id プレフィックスがファイル世代と不一致
    const expectedPrefix = GEN_PREFIX[dataset];
    if (expectedPrefix && !String(entry.id).startsWith(expectedPrefix)) {
      warn("id-prefix-mismatch", `${where}: id "${entry.id}" は "${expectedPrefix}" で始まる想定`);
    }

    // region
    if (Array.isArray(entry.region)) {
      for (const r of entry.region) {
        if (!regionValues.has(r)) {
          warn("region-not-in-master", `${where}: region "${r}" が mappings/regions.json の値集合にありません`);
        }
      }
    }

    // distributionMethod
    if ("distributionMethod" in entry && !methodValues.has(entry.distributionMethod)) {
      warn(
        "distributionMethod-not-in-master",
        `${where}: distributionMethod "${entry.distributionMethod}" が mappings/distribution-methods.json の値集合にありません`
      );
    }

    // ball
    if ("ball" in entry && !ballValues.has(entry.ball)) {
      warn("ball-not-in-master", `${where}: ball "${entry.ball}" が mappings/balls.json の値集合にありません`);
    }

    // nature
    if ("nature" in entry && !natureNames.has(entry.nature)) {
      warn("nature-not-in-master", `${where}: nature "${entry.nature}" が mappings/natures.json の name_ja にありません`);
    }

    // ribbons
    if (Array.isArray(entry.ribbons)) {
      for (const r of entry.ribbons) {
        if (!ribbonValues.has(r)) {
          warn("ribbon-not-in-master", `${where}: ribbon "${r}" が mappings/ribbons.json の値集合にありません`);
        }
      }
    }

    // ability
    if ("ability" in entry && !abilityNames.has(entry.ability)) {
      warn("ability-not-in-master", `${where}: ability "${entry.ability}" が abilities/all.json の name_ja にありません`);
    }
  }

  fileSummaries.push({ fileName, dataset, count: payload.entries.length });
}

// ---- id 重複（ファイル間） ----
for (const [id, fileNames] of idToFiles.entries()) {
  if (fileNames.length > 1) {
    warn("id-duplicate-across-files", `id "${id}" が複数ファイルに存在します: ${fileNames.join(", ")}`);
  }
}

// ---- 結果表示 ----
console.log("=== ファイル別件数 ===");
let total = 0;
for (const s of fileSummaries) {
  console.log(`  ${s.fileName} (${s.dataset}): ${s.count}件`);
  total += s.count;
}
console.log(`  合計: ${total}件`);

console.log("\n=== warning集計 ===");
if (warnings.length === 0) {
  console.log("  warningなし");
} else {
  const byType = new Map();
  for (const w of warnings) {
    if (!byType.has(w.type)) byType.set(w.type, []);
    byType.get(w.type).push(w.detail);
  }
  for (const [type, details] of byType.entries()) {
    console.log(`  ${type}: ${details.length}件`);
  }
  console.log("\n=== warning詳細 ===");
  for (const [type, details] of byType.entries()) {
    console.log(`\n[${type}] (${details.length}件)`);
    for (const d of details) {
      console.log(`  - ${d}`);
    }
  }
}

console.log("\ndistributions validation passed.");
