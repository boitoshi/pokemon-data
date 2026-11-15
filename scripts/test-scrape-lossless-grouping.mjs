// U5: 統合は除外列以外の完全一致のみ。apply先は一時封筒で正本には触らない。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-lossless-"));
const target = path.join(scratch, "gen7.json");
const flat = path.join(scratch, "flat.json");
const report = path.join(scratch, "report.json");
const base = {
  ...Object.fromEntries([
    "distributionLocation", "gender", "nature", "ability", "ball", "metLocation",
    "heldItem", "teraType", "shiny", "ot", "trainerId", "moves", "specialMoves",
    "ribbons", "evs", "gigantamax", "alpha", "password", "notes", "postUrl",
  ].map((key) => [key, ""])),
  managementId: "row-a", generation: "7", dexNo: "485", pokemonName: "ヒードラン",
  game: "サン", eventName: "First name", distributionMethod: "シリアルコード",
  startDate: "2018-03-01", endDate: "2018-03-31", level: "60", region: "日本",
  sourcePage: "regional-list-a",
};
function run(rows) {
  fs.writeFileSync(target, JSON.stringify({
    schemaVersion: 1, dataset: "gen7", generation: 7, provenance: "scraper:bulbapedia", entries: [],
  }, null, 2) + "\n");
  fs.writeFileSync(flat, JSON.stringify(rows));
  const result = spawnSync(process.execPath, [
    "scripts/scrape-to-l2.mjs", flat, "--dist-dir", scratch, "--report", report,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(fs.readFileSync(report, "utf8"));
}
try {
  const regional = {
    ...base, managementId: "row-b", region: "北米", eventName: "Other name",
    sourcePage: "regional-list-b", sourcePages: ["regional-list-b", "regional-list-c"],
  };
  const merged = run([base, regional]);
  assert.equal(merged.inputRowCount, 2);
  assert.equal(merged.scrapedCount, 1);
  assert.equal(merged.scrapedGroups.length, 1);
  assert.equal(merged.scrapedGroups[0].rowCount, 2);
  assert.deepEqual(merged.scrapedGroups[0].sourcePages, ["regional-list-a", "regional-list-b", "regional-list-c"]);
  assert.equal(merged.summary.added, 1);
  const [entry] = JSON.parse(fs.readFileSync(target, "utf8")).entries;
  assert.deepEqual(entry.region, ["日本"]);
  assert.equal(entry.eventName, base.eventName);
  assert.equal("sourcePage" in entry, false);
  assert.equal("sourcePages" in entry, false);

  // 同anchorに属しても、無損失グループは別。既存のレビュー判定はそのまま。
  for (const delta of [
    { game: "ムーン" },
    { endDate: "2018-04-01" },
    { level: "100" },
    { startDate: "2018-03-02" },
    { distributionMethod: "インターネット" },
    { ability: "もらいび" },
    { moves: "ひのこ" },
    { ot: "TEST" },
    { notes: "Different metadata is not an excluded column" },
    { futureField: "Do not silently discard unknown raw columns" },
  ]) {
    const separate = run([base, { ...base, managementId: "row-b", ...delta }]);
    assert.equal(separate.scrapedCount, 2, JSON.stringify(delta));
    assert.equal(separate.scrapedGroups.length, 2, JSON.stringify(delta));
    assert.deepEqual(separate.scrapedGroups.map((group) => group.rowCount), [1, 1]);
    assert.equal(separate.summary.added, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")).entries, []);
  }
  // JSONのキー順は列の相違ではない。
  const reordered = Object.fromEntries(Object.entries({ ...base, managementId: "row-b" }).reverse());
  assert.equal(run([base, reordered]).scrapedCount, 1);
  console.log("scrape lossless grouping validation passed.");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
