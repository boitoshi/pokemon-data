// リボン・あかしカタログ正本の検証
//
// ribbons/catalog.json を games/titles.json・mappings/ribbons.json と突き合わせて検証する。
//
// - key ユニーク / route.id ユニーク（カタログ全体で）
// - route.games の各 id が games/titles.json に存在する
// - kind が ribbon | mark
// - mappings/ribbons.json との整合: mappings の各 (en, ja) が catalog に存在し name_ja が一致する
//   （catalog ⊇ mappings。逆方向は要求しない）
//
// 実行: node scripts/validate-ribbons.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const catalog = readJson("ribbons/catalog.json");
const titles = readJson("games/titles.json");
const ribbonsMap = readJson("mappings/ribbons.json");

const titleIds = new Set(titles.map((t) => t.id));
const VALID_KINDS = new Set(["ribbon", "mark"]);

const keys = new Set();
const routeIds = new Set();

for (const entry of catalog) {
  if (keys.has(entry.key)) {
    throw new Error(`ribbons/catalog.json has duplicate key: ${entry.key}`);
  }
  keys.add(entry.key);

  if (!VALID_KINDS.has(entry.kind)) {
    throw new Error(`ribbons/catalog.json entry ${entry.key} has invalid kind: ${entry.kind}`);
  }

  for (const route of entry.routes) {
    if (routeIds.has(route.id)) {
      throw new Error(`ribbons/catalog.json has duplicate route id: ${route.id}`);
    }
    routeIds.add(route.id);

    for (const game of route.games) {
      if (!titleIds.has(game)) {
        throw new Error(`ribbons/catalog.json route ${route.id} references unknown game: ${game}`);
      }
    }
  }
}

// mappings/ribbons.json との整合（catalog ⊇ mappings）
const byNameEn = new Map(catalog.map((entry) => [`${entry.kind}:${entry.name_en}`, entry]));

for (const [kind, mapping] of [["ribbon", ribbonsMap.ribbons], ["mark", ribbonsMap.marks]]) {
  for (const [en, ja] of Object.entries(mapping)) {
    const entry = byNameEn.get(`${kind}:${en}`);
    if (!entry) {
      throw new Error(`mappings/ribbons.json ${kind} "${en}" is missing from ribbons/catalog.json`);
    }
    if (entry.name_ja !== ja) {
      throw new Error(`ribbon name mismatch for ${en}: ${ja} != ${entry.name_ja}`);
    }
  }
}

console.log("pokemon-data ribbons validation passed.");
