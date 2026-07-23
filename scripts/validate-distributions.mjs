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
const schema = readJson("distributions/schema.json");

// nature / ability の値集合照合における許容センチネル。
// "ランダム" ＝ 固定ネイチャー/特性無しと判明した場合の明示値（省略＝不明とは区別）。
const NATURE_SENTINEL_VALUES = new Set(["ランダム"]);
const ABILITY_SENTINEL_VALUES = new Set(["ランダム"]);

const entryPropertyNames = new Set(Object.keys(schema.$defs.entry.properties));
const IV_KEYS = new Set(["hp", "atk", "def", "spa", "spd", "spe"]);

// 実在日付か検証する（正規表現形式だけでなく、月日レンジ・閏年まで見る）
function isRealDate(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const titleIds = new Set(titles.map((t) => t.id));
const abilityNames = new Set(abilities.map((a) => a.name_ja));
const natureNames = new Set(natures.map((n) => n.name_ja));
const ribbonValues = new Set([
  ...Object.values(ribbonsMap.ribbons ?? ribbonsMap),
  ...Object.values(ribbonsMap.marks ?? {}),
]);
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

  // ---- 封筒整合: dataset genN ならファイル名 genN.json と一致し、generation===N ----
  const fileGenMatch = fileName.match(/^gen(\d+)\.json$/);
  if (fileGenMatch) {
    const fileGen = Number(fileGenMatch[1]);
    if (dataset !== `gen${fileGen}`) {
      throw new Error(`${fileName}: dataset "${dataset}" がファイル名 (gen${fileGen} 想定) と一致しません`);
    }
    if (payload.generation !== fileGen) {
      throw new Error(
        `${fileName}: generation (got: ${payload.generation}) が dataset "${dataset}" / ファイル名から期待される ${fileGen} と一致しません`
      );
    }
  }

  const idsInFile = new Set();

  for (const [index, entry] of payload.entries.entries()) {
    const where = `${fileName}#${index} (id=${entry.id ?? "?"})`;

    // ---- 未知キー検査（手編集正本の防御。schema.json の entry プロパティ集合に無いキーは拒否） ----
    for (const key of Object.keys(entry)) {
      if (!entryPropertyNames.has(key)) {
        throw new Error(`${where}: 未知のフィールド "${key}" があります（distributions/schema.json の entry.properties に未定義）`);
      }
    }

    // ---- 必須フィールド ----
    for (const key of ["id", "dexNo", "pokemonName", "games", "eventName", "distributionMethod", "startDate"]) {
      if (!(key in entry)) {
        throw new Error(`${where}: 必須フィールド "${key}" がありません`);
      }
    }
    if (!Array.isArray(entry.games) || entry.games.length < 1) {
      throw new Error(`${where}: games は長さ1以上の配列である必要があります`);
    }

    // ---- 配列であるべきフィールド（存在するなら配列。文字列等ならthrow） ----
    for (const key of ["region", "ribbons", "moves", "specialMoves"]) {
      if (key in entry && !Array.isArray(entry[key])) {
        throw new Error(`${where}: "${key}" は配列である必要があります（実際の型: ${typeof entry[key]}）`);
      }
    }

    // ---- ot / otFromPlayer 排他 ----
    if ("ot" in entry && "otFromPlayer" in entry) {
      throw new Error(`${where}: ot と otFromPlayer は同時に存在できません`);
    }

    // ---- otFromPlayer は厳密 true ----
    if ("otFromPlayer" in entry && entry.otFromPlayer !== true) {
      throw new Error(`${where}: otFromPlayer は true 以外許可されません (got: ${entry.otFromPlayer})`);
    }

    // ---- trainerId は文字列 ----
    if ("trainerId" in entry && typeof entry.trainerId !== "string") {
      throw new Error(`${where}: trainerId は文字列である必要があります (got: ${typeof entry.trainerId})`);
    }

    // ---- level は 1..100 の整数 ----
    if ("level" in entry && !(Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 100)) {
      throw new Error(`${where}: level は1..100の整数である必要があります (got: ${entry.level})`);
    }

    // ---- ivs はキーが {hp,atk,def,spa,spd,spe} のみ・各0..31 ----
    if ("ivs" in entry) {
      if (typeof entry.ivs !== "object" || entry.ivs === null || Array.isArray(entry.ivs)) {
        throw new Error(`${where}: ivs はオブジェクトである必要があります`);
      }
      for (const [k, v] of Object.entries(entry.ivs)) {
        if (!IV_KEYS.has(k)) {
          throw new Error(`${where}: ivs に未知のキー "${k}" があります（許可: hp/atk/def/spa/spd/spe）`);
        }
        if (!(Number.isInteger(v) && v >= 0 && v <= 31)) {
          throw new Error(`${where}: ivs.${k} は0..31の整数である必要があります (got: ${v})`);
        }
      }
    }

    // ---- ivsGuaranteed は0..6整数 ----
    if (
      "ivsGuaranteed" in entry &&
      !(Number.isInteger(entry.ivsGuaranteed) && entry.ivsGuaranteed >= 0 && entry.ivsGuaranteed <= 6)
    ) {
      throw new Error(`${where}: ivsGuaranteed は0..6の整数である必要があります (got: ${entry.ivsGuaranteed})`);
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

    // ---- 日付（形式 + 実在日付の両方を検証。2015-13-40 のような値を弾く） ----
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(entry.startDate)) {
      throw new Error(`${where}: startDate "${entry.startDate}" が YYYY-MM-DD 形式ではありません`);
    }
    if (!isRealDate(entry.startDate)) {
      throw new Error(`${where}: startDate "${entry.startDate}" は実在しない日付です`);
    }
    if ("endDate" in entry) {
      if (!dateRe.test(entry.endDate)) {
        throw new Error(`${where}: endDate "${entry.endDate}" が YYYY-MM-DD 形式ではありません`);
      }
      if (!isRealDate(entry.endDate)) {
        throw new Error(`${where}: endDate "${entry.endDate}" は実在しない日付です`);
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

    // nature（"ランダム" は固定ネイチャー無しと判明した場合の許容センチネルなので対象外）
    if ("nature" in entry && !NATURE_SENTINEL_VALUES.has(entry.nature) && !natureNames.has(entry.nature)) {
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

    // ability（"ランダム" は特性未確定と判明した場合の許容センチネルなので対象外）
    if ("ability" in entry && !ABILITY_SENTINEL_VALUES.has(entry.ability) && !abilityNames.has(entry.ability)) {
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
