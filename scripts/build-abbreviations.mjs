// 配信ポケモン正本 P3a: build-abbreviations.mjs
//
// アプリ一覧表示で使われる略称（ゲーム名の shortName、配布方法 distributionMethod）の
// 対照表を生成する。
//
// なぜ手書きの対照表を持たないのか:
//   ゲーム名の正式名は games/titles.json に shortName/name/name_en として既にそろっている。
//   配布方法の正式名（英語の原語）は mappings/distribution-methods.json の
//   「英語キー → 日本語値」を逆引きすれば得られる（例: "バンク" ← "Pokémon Bank"）。
//   どちらも既存マスターから機械的に導出できるため、対照表を別途手で書くと
//   二重管理（片方を直してももう片方が更新されない事故）になる。
//   そのためこのファイルは生成のみを行い、mappings/method-glossary.json に
//   手書きするのは「逆引きしても意味が伝わらない値」への補足 note だけに限定する。
//
// 出力: build/abbreviations.json
// 実行: node scripts/build-abbreviations.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const readJsonOptional = (relativePath, fallback) => {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
};

// ---- distributions/*.json（distributionMethod の実データ値集合を集めるためだけに読む） ----
const DISTRIBUTION_FILES = ["gen5.json", "gen6.json", "gen7.json", "gen8.json", "gen9.json", "champions.json"];

// ALOLA: distributions/gen7.json#151 のみに現れる意味不明値
// （validate-distributions.mjs が distributionMethod-not-in-master warning を出している）。
// 実データを鵜呑みにして対照表に載せると誤情報になるため、ここでは明示的に除外する。
const EXCLUDED_METHOD_VALUES = new Set(["ALOLA"]);

function collectUsedDistributionMethods() {
  const used = new Set();
  for (const file of DISTRIBUTION_FILES) {
    const payload = readJson(path.join("distributions", file));
    for (const entry of payload.entries) {
      if (typeof entry.distributionMethod === "string" && entry.distributionMethod.length > 0) {
        used.add(entry.distributionMethod);
      }
    }
  }
  return used;
}

// ---- games/titles.json → ゲーム略称対照表 ----
// shortName と name が一致するエントリは「略称」ではないので除外する。
function buildGameAbbreviations(titles) {
  const rows = [];
  for (const title of titles) {
    if (title.shortName === title.name) continue;
    rows.push({
      id: title.id,
      shortName: title.shortName,
      name: title.name,
      name_en: title.name_en,
    });
  }
  return rows;
}

// ---- mappings/distribution-methods.json（英語キー → 日本語値）を日本語値 → 英語キー[] に逆引き ----
function buildReverseMethodMap(distributionMethods) {
  const reverse = new Map();
  for (const [englishKey, japaneseValue] of Object.entries(distributionMethods)) {
    if (!reverse.has(japaneseValue)) reverse.set(japaneseValue, []);
    reverse.get(japaneseValue).push(englishKey);
  }
  return reverse;
}

// ---- 配布方法対照表 = 実データで使われている値（ALOLA除く）× (逆引きキー + 補足note) ----
function buildMethodAbbreviations(usedMethods, reverseMap, glossaryNotes) {
  const methods = {};
  const sortedValues = [...usedMethods].filter((v) => !EXCLUDED_METHOD_VALUES.has(v)).sort();
  for (const value of sortedValues) {
    const entry = { sourceKeys: reverseMap.get(value) ?? [] };
    if (Object.prototype.hasOwnProperty.call(glossaryNotes, value)) {
      entry.note = glossaryNotes[value];
    }
    methods[value] = entry;
  }
  return methods;
}

// ---- 起動時バリデーション: method-glossary.json の note キーが実データに存在するか（タイポ検知） ----
function validateGlossaryKeys(glossaryNotes, usedMethods) {
  const unknownKeys = Object.keys(glossaryNotes).filter(
    (key) => !usedMethods.has(key) && !EXCLUDED_METHOD_VALUES.has(key)
  );
  if (unknownKeys.length > 0) {
    console.warn(
      `⚠️  mappings/method-glossary.json に、distributions/*.json のdistributionMethodに存在しないキーがあります（タイポの可能性）:\n` +
        unknownKeys.map((k) => `    - ${k}`).join("\n")
    );
  }
}

// ---- ビルド本体 ----
const titles = readJson("games/titles.json");
const distributionMethods = readJson("mappings/distribution-methods.json");
const glossary = readJsonOptional("mappings/method-glossary.json", { notes: {} });
const glossaryNotes = glossary.notes ?? {};

const usedMethods = collectUsedDistributionMethods();
validateGlossaryKeys(glossaryNotes, usedMethods);

const games = buildGameAbbreviations(titles);
const reverseMethodMap = buildReverseMethodMap(distributionMethods);
const methods = buildMethodAbbreviations(usedMethods, reverseMethodMap, glossaryNotes);

const buildDir = path.join(root, "build");
fs.mkdirSync(buildDir, { recursive: true });

const outputPath = path.join(buildDir, "abbreviations.json");

const output = {
  schemaVersion: 1,
  source: "games/titles.json + mappings/distribution-methods.json + mappings/method-glossary.json",
  counts: {
    games: games.length,
    methods: Object.keys(methods).length,
  },
  games,
  methods,
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log("build-abbreviations: 完了");
console.log(`  games: ${games.length}件（titles.json ${titles.length}件中、shortName===nameの${titles.length - games.length}件を除外）`);
console.log(`  methods: ${Object.keys(methods).length}件（ALOLAを除く実データ値集合。うちnote付き: ${Object.values(methods).filter((m) => "note" in m).length}件）`);
console.log(`  ${path.relative(root, outputPath)} を出力しました`);
