// 正本には書かず、一時コピーで種族・フォームの types を検証する。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "test-data-"));
try {
  for (const dir of ["schemas", "pokemon", "games", "abilities", "mappings", "ribbons", "services"]) {
    fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
  }
  const original = JSON.parse(fs.readFileSync(path.join(temp, "pokemon/all.json"), "utf8"));
  const types = Object.values(JSON.parse(fs.readFileSync(path.join(temp, "mappings/types.json"), "utf8")));
  const speciesKey = Object.keys(original).find((key) => original[key].forms?.length);
  assert.ok(speciesKey, "フォームを持つ種族が必要");
  function check(copy, expected, pattern) {
    fs.writeFileSync(path.join(temp, "pokemon/all.json"), JSON.stringify(copy));
    const result = spawnSync(process.execPath, [path.join(root, "scripts/validate-data.mjs")], { cwd: temp, encoding: "utf8" });
    assert.ifError(result.error);
    assert.notEqual(result.status, null, result.stderr);
    if (expected === 0) assert.equal(result.status, 0, result.stderr);
    else {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, pattern);
    }
  }
  check(original, 0);
  for (const target of ["species", "form"]) {
    function withTypes(value) {
      const copy = structuredClone(original);
      const entry = copy[speciesKey];
      (target === "species" ? entry : entry.forms[0]).types = value;
      return copy;
    }
    for (const valid of [[types[0]], types.slice(0, 2)]) check(withTypes(valid), 0);
    // フォームの types は省略できる（undefined は JSON に書くとキーごと消える）
    if (target === "form") check(withTypes(undefined), 0);
    const invalids = [null, types[0], [], types.slice(0, 3), [types[0], types[0]], ["INVALID_TYPE"]];
    if (target === "species") invalids.unshift(undefined);
    for (const invalid of invalids) {
      check(withTypes(invalid), 1, /types|unknown type/);
    }
  }
  console.log("Pokemon types validator regression checks passed.");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
