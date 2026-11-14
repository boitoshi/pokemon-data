// 一時コピーに違反を注入し、検証・ビルドの実際の終了コードを確認する。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
fs.mkdirSync("/tmp/t068-u1", { recursive: true });
const temp = fs.mkdtempSync("/tmp/t068-u1/test-distributions-");
const read = (file) => JSON.parse(fs.readFileSync(path.join(temp, file), "utf8"));
const write = (file, value) => fs.writeFileSync(path.join(temp, file), JSON.stringify(value));
try {
  for (const dir of ["distributions", "pokemon", "games", "abilities", "mappings"]) {
    fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
  }
  const gen9 = read("distributions/gen9.json");
  const gen8 = read("distributions/gen8.json");
  const kinds = JSON.parse(fs.readFileSync(path.join(root, "distributions/schema.json"), "utf8"))
    .$defs.entry.properties.event.properties.kind.enum;
  function check(expected, pattern, scripts = ["validate-distributions.mjs", "build-distributions.mjs"]) {
    // 失敗ビルドが既存の生成物を上書きしないことも確認する。
    const before = fs.existsSync(path.join(temp, "build"))
      ? fs.readdirSync(path.join(temp, "build")).map((name) => [name, fs.readFileSync(path.join(temp, "build", name), "utf8")]) : [];
    for (const script of scripts) {
      const result = spawnSync(process.execPath, [path.join(root, "scripts", script)], { cwd: temp, encoding: "utf8" });
      assert.ifError(result.error);
      assert.notEqual(result.status, null, result.stderr);
      if (expected === 0) assert.equal(result.status, 0, result.stderr);
      else {
        assert.notEqual(result.status, 0, script);
        assert.match(result.stderr, pattern);
      }
    }
    if (expected !== 0) {
      for (const [name, content] of before) assert.equal(fs.readFileSync(path.join(temp, "build", name), "utf8"), content);
    }
  }
  check(0);
  const candidates = ["せいでんき", "ひらいしん"];
  for (const value of [null, "せいでんき", [], ["せいでんき"], ["せいでんき", "せいでんき"], ["せいでんき", "未知の特性"], ["せいでんき", "ランダム"], ["せいでんき", 1], ["せいでんき", " ひらいしん"]]) {
    const copy = structuredClone(gen9);
    delete copy.entries[0].ability;
    copy.entries[0].abilityCandidates = value;
    write("distributions/gen9.json", copy);
    check(1, /abilityCandidates/, ["validate-distributions.mjs"]);
  }
  const copy = structuredClone(gen9);
  copy.entries[0].ability = "せいでんき";
  copy.entries[0].abilityCandidates = candidates;
  write("distributions/gen9.json", copy);
  check(1, /ability.*abilityCandidates/, ["validate-distributions.mjs"]);
  delete copy.entries[0].ability;
  write("distributions/gen9.json", copy);
  check(0);
  const built = read("build/pokemon.json").find((entry) => entry.managementId === copy.entries[0].id);
  assert.equal(built.ability, "せいでんき / ひらいしん");
  assert.deepEqual(built.abilityCandidates, candidates);
  write("distributions/gen9.json", gen9);
  for (const kind of kinds) {
    const copy = structuredClone(gen9);
    copy.entries[0].event = { kind };
    write("distributions/gen9.json", copy);
    check(0);
  }
  // kind の無い event は schema が許すので通る
  for (const event of [{}, { year: 2027 }]) {
    const copy = structuredClone(gen9);
    copy.entries[0].event = event;
    write("distributions/gen9.json", copy);
    check(0);
  }
  for (const event of [{ kind: "INVALID_KIND" }, null, "x"]) {
    const copy = structuredClone(gen9);
    copy.entries[0].event = event;
    write("distributions/gen9.json", copy);
    check(1, /event/);
  }
  write("distributions/gen9.json", gen9);
  const duplicate = structuredClone(gen8);
  duplicate.entries.push(structuredClone(gen9.entries[0]));
  write("distributions/gen8.json", duplicate);
  check(1, /重複|複数ファイル/);
  write("distributions/gen8.json", gen8);
  check(0);
  console.log("Distribution validator/build regression checks passed.");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
