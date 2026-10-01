// 一時repo形状からビルドし、Gen3未収録個体値と既存世代の表示を検証する。
// 実行: node scripts/test-build-gen3-ivs.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "build-gen3-ivs-"));
try {
  fs.mkdirSync(path.join(scratch, "games"));
  fs.copyFileSync(path.join(root, "games/titles.json"), path.join(scratch, "games/titles.json"));
  fs.mkdirSync(path.join(scratch, "distributions"));
  const base = {
    dexNo: 25, pokemonName: "ピカチュウ", games: ["ruby"], eventName: "テスト個体",
    distributionMethod: "未確認", startDate: "2003-04-25",
  };
  for (const dataset of ["gen3", "gen4", "gen5", "gen6", "gen7", "gen8", "gen9", "champions"]) {
    const entries = dataset === "gen3" ? [
      { ...base, id: "03001" },
      { ...base, id: "03002", ivs: { hp: 31, atk: 0 } },
      { ...base, id: "03003", ivsGuaranteed: 3 },
    ] : dataset === "gen4" ? [{ ...base, id: "04001", games: ["diamond"] }] : [];
    fs.writeFileSync(path.join(scratch, "distributions", `${dataset}.json`), JSON.stringify({
      schemaVersion: 1, dataset, generation: dataset === "champions" ? 0 : Number(dataset.slice(3)), entries,
    }));
  }
  const result = spawnSync(process.execPath, [path.join(root, "scripts/build-distributions.mjs")], {
    cwd: scratch, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const records = JSON.parse(fs.readFileSync(path.join(scratch, "build/pokemon.json"), "utf8"));
  assert.equal("ivs" in records[0], false);
  assert.deepEqual(records[1].ivs, { hp: 31, atk: 0 });
  assert.equal(records[2].ivs, "3V");
  assert.equal(records[3].ivs, "ランダム");
  console.log("Gen3 IV build validation passed.");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
