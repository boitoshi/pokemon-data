// 明示承認による同anchorの別個体取り込みと、再実行・重複拒否の回帰検証。
// 実行: node scripts/test-scrape-multi-variant.mjs（正本には書き込まない）
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-multi-variant-"));
const target = path.join(scratch, "gen3.json");
const flat = path.join(scratch, "flat.json");
const report = path.join(scratch, "report.json");
const envelope = { schemaVersion: 1, dataset: "gen3", generation: 3, provenance: "scraper:bulbapedia", entries: [] };
const emptyFields = [
  "distributionLocation", "endDate", "region", "level", "gender", "nature", "ability", "ball",
  "metLocation", "heldItem", "teraType", "shiny", "ot", "trainerId", "moves", "specialMoves",
  "ribbons", "evs", "gigantamax", "alpha", "password", "notes", "postUrl",
];
const base = {
  ...Object.fromEntries(emptyFields.map((key) => [key, ""])),
  generation: "3", dexNo: "25", pokemonName: "ピカチュウ", game: "ルビー",
  eventName: "テスト用タマゴ", distributionMethod: "未確認", startDate: "2003-04-25",
};
const twins = [
  { ...base, managementId: "temporary-a", moves: "なきごえ, でんきショック" },
  { ...base, managementId: "temporary-b", moves: "なきごえ, しっぽをふる" },
];
/** 一時封筒だけを初期化して入力行を用意する。 */
function reset(rows) {
  fs.writeFileSync(target, JSON.stringify(envelope, null, 2) + "\n");
  fs.writeFileSync(flat, JSON.stringify(rows));
  if (fs.existsSync(report)) fs.unlinkSync(report);
}
/** CLIを実行し、exit statusと機械可読レポートを検査対象として返す。 */
function run(flags = []) {
  const result = spawnSync(process.execPath, [
    "scripts/scrape-to-l2.mjs", flat, "--dist-dir", scratch, "--report", report, ...flags,
  ], { cwd: process.cwd(), encoding: "utf8" });
  return { ...result, payload: fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : null };
}

try {
  reset(twins);
  const original = fs.readFileSync(target, "utf8");
  const excluded = run();
  assert.equal(excluded.status, 0, excluded.stderr);
  assert.equal(excluded.payload.summary.added, 0);
  assert.equal(excluded.payload.summary.multiVariant, 1);
  assert.equal(fs.readFileSync(target, "utf8"), original);

  const accepted = run(["--accept-multi-variant"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.payload.summary.added, 2);
  assert.equal(accepted.payload.summary.multiVariantAccepted, 2);
  assert.equal(accepted.payload.multiVariantAccepted[0].members.length, 2);
  const populated = fs.readFileSync(target, "utf8");
  const imported = JSON.parse(populated).entries;
  assert.deepEqual(imported.map((entry) => entry.id), ["03001", "03002"]);
  assert.deepEqual(imported.map((entry) => entry.moves), [
    ["なきごえ", "でんきショック"], ["なきごえ", "しっぽをふる"],
  ]);

  // provisional IDや入力順が変わっても、既存anchorのIDと本文は維持する。
  fs.writeFileSync(flat, JSON.stringify(twins.toReversed().map((row, i) => ({ ...row, managementId: `rerun-${i}` }))));
  const repeated = run(["--accept-multi-variant"]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(repeated.payload.summary.added, 0);
  assert.equal(fs.readFileSync(target, "utf8"), populated);

  for (const duplicate of [
    { ...twins[0], managementId: "duplicate" },
    { ...twins[0], managementId: "metadata-only", eventName: "別の表記", notes: "別の備考" },
    { ...twins[0], managementId: "reordered", moves: "でんきショック, なきごえ" },
  ]) {
    reset([twins[0], duplicate]);
    const before = fs.readFileSync(target, "utf8");
    const rejected = run(["--accept-multi-variant"]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /同一個体の重複/);
    assert.equal(fs.readFileSync(target, "utf8"), before);
    assert.equal(fs.existsSync(report), false);
    assert.equal(fs.existsSync(target + ".tmp"), false);
  }

  // 孵化者・プレイヤーの説明文はOT/IDのリテラル値として保存しない。
  for (const marker of ["(孵化した人のもの)", "(プレイヤーのもの)"]) {
    reset([{ ...twins[0], ot: marker, trainerId: marker }]);
    const playerOwned = run();
    assert.equal(playerOwned.status, 0, playerOwned.stderr);
    const entry = JSON.parse(fs.readFileSync(target, "utf8")).entries[0];
    assert.equal(entry.otFromPlayer, true);
    assert.equal("ot" in entry, false);
    assert.equal("trainerId" in entry, false);
  }
  reset([{ ...twins[0], ot: "(孵化した人のもの)", trainerId: "00123" }]);
  const realId = run();
  assert.equal(realId.status, 0, realId.stderr);
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).entries[0].trainerId, "00123");
  console.log("scrape multi-variant validation passed.");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
