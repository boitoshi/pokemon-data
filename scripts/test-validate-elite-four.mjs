// 実データと異常を注入したコピーで、検証関数とCLIの失敗を確認する。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateEliteFour } from "./validate-elite-four.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const roster = read("trainers/elite-four-roster.json");
const data = read("trainers/elite-four.json");
assert.deepEqual(validateEliteFour(data, roster), []);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "elite-four-validator-"));
const cli = (copy, rosterCopy = roster) => {
  fs.writeFileSync(path.join(temp, "trainers/elite-four-roster.json"), JSON.stringify(rosterCopy));
  fs.writeFileSync(path.join(temp, "trainers/elite-four.json"), JSON.stringify(copy));
  return spawnSync(process.execPath, [path.join(root, "scripts/validate-elite-four.mjs")], { cwd: temp, encoding: "utf8" });
};
try {
  fs.mkdirSync(path.join(temp, "trainers"));
  assert.equal(cli(data).status, 0);
  function rejects(change, pattern, changeRoster = () => {}) {
    const copy = structuredClone(data);
    const rosterCopy = structuredClone(roster);
    change(copy);
    changeRoster(rosterCopy);
    assert.match(validateEliteFour(copy, rosterCopy).join("\n"), pattern);
    const result = cli(copy, rosterCopy);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, pattern);
  }
  rejects((copy) => { copy.trainers[0].role = "elite_forr"; }, /未知のrole/);
  rejects((copy) => { copy.trainers[0].ja = "不一致"; }, /jaが名簿メタデータと不一致/);
  for (const value of ["", " \t\n", null, 123]) {
    rejects((copy) => { copy.trainers[0].parties[0].title_ja = value; }, /title_jaは空でない文字列/);
  }
  rejects(() => {}, /未知のrole/, (copy) => { copy.trainers[0].role = "elite_forr"; });
  rejects((copy) => { copy.trainers[0].role = "champion"; }, /roleが名簿メタデータと不一致/);
  rejects((copy) => { copy.trainers[0].region = "不一致"; }, /名簿にないトレーナー/);
  rejects((copy) => { copy.trainers[0].order = 999; }, /名簿にないトレーナー/);
  rejects((copy) => { copy.trainers.shift(); }, /欠落/);
  rejects((copy) => { copy.trainers.push(structuredClone(copy.trainers[0])); }, /重複/);
  const reordered = structuredClone(data);
  reordered.trainers.reverse();
  assert.deepEqual(validateEliteFour(reordered, roster), []);
  const title = structuredClone(data);
  title.trainers[0].parties[0].title_ja = "四天王";
  assert.deepEqual(validateEliteFour(title, roster), []);
  delete title.trainers[0].parties[0].title_ja;
  assert.deepEqual(validateEliteFour(title, roster), []);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log("Elite four validator regression checks passed (function + CLI).");
