import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derive, display } from "./validate-champions-regulations.mjs";

const keys = (...values) => new Map(values.map((value) => [value, String(value)]));
const source = (role, values, extra = {}) => ({ role, keys: keys(...values), ...extra });
const secondary = (values, extra) => source("secondary-additions", values, extra);

function check(label, {
  division = "species",
  sources,
  preceding = { complete: true, keys: keys() },
  method,
  result,
  coverage,
  publishable,
  values = [],
  message,
}) {
  const evidence = { file: "fixture.json", sources };
  const lists = sources.filter(({ role }) => role === "secondary-additions");
  const actual = derive(division, evidence, lists, preceding, label);
  assert.deepEqual(actual, { method, result, coverage, publishable, keys: keys(...values) }, label);
  assert.equal(display(actual, actual.keys.size), message, label);
}

check("独立した二出典がともに明示的に0件", {
  sources: [secondary([], { zeroReason: "追加0件" }), secondary([], { zeroReason: "追加なし" })],
  method: "independent-secondary-lists",
  result: "verified",
  coverage: "complete",
  publishable: true,
  message: "追加なし",
});

check("二出典が互いに素", {
  sources: [secondary([3]), secondary([6])],
  method: "independent-secondary-lists",
  result: "disputed",
  coverage: "partial",
  publishable: true,
  message: "出典間の不一致・未確認分あり（一致を確認できた追加分は0件）",
});

check("公式追加一覧に未解決行がある", {
  sources: [source("official-additions", [3], { unresolved: true })],
  method: "official-additions",
  result: "pending",
  coverage: "partial",
  publishable: false,
  values: [3],
  message: "公式の追加一覧を確認中（確定分のみ）",
});

for (const [division, first, second] of [
  ["species", 3, 6],
  ["megas", JSON.stringify([3, "メガフシギバナ"]), JSON.stringify([6, "メガリザードンX"])],
]) {
  check(`公式累積一覧があり先行回が未完了（${division}）`, {
    division,
    sources: [source("official-cumulative", [first, second])],
    preceding: { complete: false, keys: keys(first) },
    method: "official-cumulative",
    result: "pending",
    coverage: "partial",
    publishable: false,
    message: "公式の累積一覧を確認中（確定分のみ）",
  });
}

check("フォルムの片出典", {
  division: "forms",
  sources: [secondary([JSON.stringify([26, "raichu-alola"])])],
  method: "insufficient-sources",
  result: "single-source",
  coverage: "partial",
  publishable: true,
  message: "片方の出典のみで確認（照合未了）",
});

const read = (file) => JSON.parse(readFileSync(new URL(`../games/${file}`, import.meta.url), "utf8"));
const { regulations } = read("champions-regulations.json");
const cumulative = new Set();
for (const [id, expectedCount] of [["M-A", 186], ["M-B", 208], ["M-C", 231]]) {
  const round = regulations.find((entry) => entry.id === id);
  const { sources } = read(`champions-verification/${id}.species.json`);
  const { rows } = sources.find(({ role }) => role === "official-cumulative");
  const eligible = new Set(rows.map(({ raw }) => {
    const match = /^(\d{4})-\d{3} \| /.exec(raw);
    assert.ok(match, `${id}: 掲載コードがない行 ${raw}`);
    return Number(match[1]);
  }));
  for (const { dexNo } of round.addedPokemon) cumulative.add(dexNo);
  assert.equal(eligible.size, expectedCount, id);
  assert.deepEqual(cumulative, eligible, `${id}: 公式 Eligible Pokémon と種の累積が一致する`);
}

console.log("Champions regulations acceptance examples and Eligible Pokémon totals validated");
