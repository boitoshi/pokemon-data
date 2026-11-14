// 正本に触れず、候補の取り込み・検証・比較と report-only 更新を確認する。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

fs.mkdirSync("/tmp/t068-u1", { recursive: true });
const scratch = fs.mkdtempSync("/tmp/t068-u1/scrape-ability-");
const target = path.join(scratch, "gen3.json");
const flat = path.join(scratch, "flat.json");
const report = path.join(scratch, "report.json");
const base = {
  ...Object.fromEntries([
    "distributionLocation", "endDate", "region", "level", "gender", "nature", "ability", "ball",
    "metLocation", "heldItem", "teraType", "shiny", "ot", "trainerId", "moves", "specialMoves",
    "ribbons", "evs", "gigantamax", "alpha", "password", "notes", "postUrl",
  ].map((key) => [key, ""])),
  managementId: "temporary", generation: "3", dexNo: "25", pokemonName: "ピカチュウ",
  game: "ルビー", eventName: "テスト配信", distributionMethod: "未確認", startDate: "2003-04-25",
};
const candidates = "せいでんき, ひらいしん";
function reset(rows, entries = []) {
  fs.writeFileSync(target, JSON.stringify({ schemaVersion: 1, dataset: "gen3", generation: 3, entries }, null, 2) + "\n");
  fs.writeFileSync(flat, JSON.stringify(rows));
  fs.rmSync(report, { force: true });
}
function run(flags = []) {
  const result = spawnSync(process.execPath, ["scripts/scrape-to-l2.mjs", flat,
    "--dist-dir", scratch, "--report", report, ...flags], { encoding: "utf8" });
  assert.ifError(result.error);
  return result;
}
const payload = () => JSON.parse(fs.readFileSync(report, "utf8"));
try {
  for (const row of [
    { ...base, ability: "せいでんき", abilityCandidates: candidates },
    ...["せいでんき", "せいでんき, せいでんき", "せいでんき, 未知", "せいでんき, ランダム", "せいでんき, ", ["せいでんき", "ひらいしん"]]
      .map((abilityCandidates) => ({ ...base, abilityCandidates })),
  ]) {
    reset([row]);
    const before = fs.readFileSync(target, "utf8");
    const rejected = run();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /abilityCandidates/);
    assert.equal(fs.readFileSync(target, "utf8"), before);
    assert.equal(fs.existsSync(report), false);
  }
  reset([{ ...base, abilityCandidates: candidates }]);
  const accepted = run();
  assert.equal(accepted.status, 0, accepted.stderr);
  const entry = JSON.parse(fs.readFileSync(target, "utf8")).entries[0];
  assert.deepEqual(entry.abilityCandidates, ["せいでんき", "ひらいしん"]);
  assert.equal("ability" in entry, false);

  // 両候補の順序の違いは差分にせず、候補の集合が違えば conflict にする。
  reset([{ ...base, managementId: "second", abilityCandidates: "ひらいしん, せいでんき" }], [entry]);
  assert.equal(run().status, 0);
  assert.deepEqual(payload().updateCandidate[0].conflicts, []);
  reset([{ ...base, managementId: "second", abilityCandidates: "せいでんき, もうか" }], [entry]);
  assert.equal(run().status, 0);
  assert.equal(payload().updateCandidate[0].conflicts[0].field, "abilityCandidates");

  // source 保護や verified があっても候補を報告する。通常実行でも既存値には適用しない。
  for (const source of [undefined, { kind: "self" }, { kind: "official" }, { kind: "bulbapedia" }]) {
    const existing = { ...entry, ability: "せいでんき", source,
      verified: { method: "in-game", fields: ["ability"] } };
    delete existing.abilityCandidates;
    reset([{ ...base, abilityCandidates: candidates },
      { ...base, managementId: "second", abilityCandidates: "せいでんき, もうか" }], [existing]);
    const before = fs.readFileSync(target, "utf8");
    const matched = run();
    assert.equal(matched.status, 0, matched.stderr);
    assert.equal(payload().summary.added, 0);
    assert.equal(payload().updateCandidate[0].abilityUpdates.length, 2);
    assert.equal(payload().updateCandidate[0].abilityUpdates[0].ledger, "せいでんき");
    assert.deepEqual(payload().updateCandidate[0].abilityUpdates[0].scraper, ["せいでんき", "ひらいしん"]);
    assert.match(matched.stdout, /ability 台帳=せいでんき → abilityCandidates/);
    assert.equal(fs.readFileSync(target, "utf8"), before);
  }
  // 候補だけが違う別個体を許可し、候補順序だけが違う重複は拒否する。
  reset([{ ...base, abilityCandidates: candidates }, { ...base, managementId: "second", abilityCandidates: "せいでんき, もうか" }]);
  assert.equal(run(["--accept-multi-variant"]).status, 0);
  assert.equal(payload().summary.added, 2);
  reset([{ ...base, abilityCandidates: candidates }, { ...base, managementId: "second", abilityCandidates: "ひらいしん, せいでんき" }]);
  const duplicate = run(["--accept-multi-variant"]);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /同一個体の重複/);
  // 新列が空なら従来の ability を取り込める。
  reset([{ ...base, ability: "せいでんき", abilityCandidates: "" }]);
  assert.equal(run().status, 0);
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).entries[0].ability, "せいでんき");
  console.log("scrape ability candidates validation passed.");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
