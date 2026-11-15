// U4: 日付が離れた同dexNoは要確認。正本には書かず、一時封筒でapplyまで検証する。
// 実行: node scripts/test-scrape-same-individual.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-same-individual-"));
const target = path.join(scratch, "gen7.json");
const flat = path.join(scratch, "flat.json");
const report = path.join(scratch, "report.json");
const existing = {
  id: "07088", dexNo: 807, pokemonName: "ゼラオラ", games: ["ultra_sun", "ultra_moon"],
  eventName: "既存の配信", distributionMethod: "シリアルコード",
  startDate: "2018-10-01", endDate: "2018-11-15", source: { kind: "bulbapedia" },
};
const row = {
  ...Object.fromEntries([
    "distributionLocation", "region", "level", "gender", "nature", "ability", "ball",
    "metLocation", "heldItem", "teraType", "shiny", "ot", "trainerId", "moves", "specialMoves",
    "ribbons", "evs", "gigantamax", "alpha", "password", "notes", "postUrl",
  ].map((key) => [key, ""])),
  managementId: "temporary", generation: "7", dexNo: "807", pokemonName: "ゼラオラ",
  game: "ウルトラサン, ウルトラムーン", eventName: "地域別日程",
  distributionMethod: "シリアルコード", startDate: "2019-05-03", endDate: "2019-06-01",
};
function reset(rows, entries = [existing]) {
  fs.writeFileSync(target, JSON.stringify({
    schemaVersion: 1, dataset: "gen7", generation: 7, provenance: "scraper:bulbapedia", entries,
  }, null, 2) + "\n");
  fs.writeFileSync(flat, JSON.stringify(rows));
}
function run(flags = []) {
  const result = spawnSync(process.execPath, [
    "scripts/scrape-to-l2.mjs", flat, "--dist-dir", scratch, "--report", report, ...flags,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return { payload: JSON.parse(fs.readFileSync(report, "utf8")), stdout: result.stdout };
}
try {
  // 日付窓外・終了日も別。既存IDを報告し、applyでも一切追加しない。
  reset([row]);
  const before = fs.readFileSync(target, "utf8");
  const far = run();
  assert.equal(far.payload.summary.added, 0);
  assert.equal(far.payload.summary.nearDup, 1);
  assert.deepEqual(far.payload.nearDup[0].existingIds, ["07088"]);
  assert.deepEqual(far.payload.nearDup[0].startDateDiff, {
    field: "startDate", ledger: existing.startDate, scraper: row.startDate,
  });
  assert.match(far.stdout, /要確認・既存に酷似/);
  assert.equal(fs.readFileSync(target, "utf8"), before);

  // 本当に新しい種族は従来どおり採番・追加される。
  reset([{ ...row, dexNo: "25", pokemonName: "ピカチュウ" }]);
  const novel = run().payload;
  assert.equal(novel.summary.added, 1);
  assert.equal(novel.summary.nearDup, 0);
  const entries = JSON.parse(fs.readFileSync(target, "utf8")).entries;
  assert.deepEqual(entries[0], existing);
  assert.equal(entries[1].id, "07089");
  assert.equal(entries[1].dexNo, 25);

  // ±7日の境界と終了日一致を保つ。窓外の同種族を候補リストへ混ぜない。
  const distant = { ...existing, id: "07001", startDate: "2016-01-01", endDate: "2016-02-01" };
  for (const nearRow of [
    { ...row, startDate: "2018-10-08" },
    { ...row, startDate: "2018-09-24" },
    { ...row, startDate: "2018-11-01", endDate: existing.endDate },
  ]) {
    reset([nearRow], [distant, existing]);
    const original = fs.readFileSync(target, "utf8");
    const near = run().payload;
    assert.equal(near.summary.added, 0);
    assert.equal(near.summary.nearDup, 1);
    assert.deepEqual(near.nearDup[0].existingIds, ["07088"]);
    assert.equal(fs.readFileSync(target, "utf8"), original);
    const approved = run(["--accept-near-dup"]).payload;
    assert.equal(approved.summary.added, 1);
    assert.equal(approved.summary.nearDupAccepted, 1);
    assert.deepEqual(approved.nearDupAccepted[0].existingIds, ["07088"]);
  }

  // anchor一致は日付窓外の候補があっても従来どおりMATCHED（書き換えない）。
  reset([{ ...row, startDate: existing.startDate }], [distant, existing]);
  const matchedBefore = fs.readFileSync(target, "utf8");
  const matched = run().payload;
  assert.equal(matched.summary.added, 0);
  assert.equal(matched.summary.nearDup, 0);
  assert.equal(matched.summary.updateCandidate, 1);
  assert.equal(fs.readFileSync(target, "utf8"), matchedBefore);
  console.log("scrape same-individual validation passed.");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
