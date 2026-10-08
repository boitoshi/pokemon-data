// 名簿を集合の正本として、四天王・チャンピオン等の手持ちを照合する。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROLES = new Set([
  "elite_four", "champion", "island_kahuna", "rival",
  "elite_four_unofficial", "champion_unofficial",
]);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
// Furfrou League は同じpageに複数人がいる。地方内の名簿位置で区別する。
const trainerKey = (row) => JSON.stringify([row.page, row.region, row.order]);

/** 名簿と手持ちの集合・表示メタデータ・任意の対戦肩書きを検査する。 */
export function validateEliteFour(data, roster) {
  const errors = [];
  if (!Array.isArray(roster?.trainers) || roster.trainers.length === 0) return ["名簿: trainersが空です"];
  if (!Array.isArray(data?.trainers)) return ["手持ち: trainers配列が必要です"];
  const expected = new Map();
  for (const row of roster.trainers) {
    const label = `名簿 ${row.page ?? "?"} (${row.region ?? "?"}/${row.order ?? "?"})`;
    if (!nonempty(row.page) || !nonempty(row.ja) || !nonempty(row.region)) errors.push(`${label}: page/ja/regionは空でない文字列が必要です`);
    if (!Number.isInteger(row.order) || row.order < 1) errors.push(`${label}: orderは正の整数が必要です`);
    if (!ROLES.has(row.role)) errors.push(`${label}: 未知のrole ${row.role}`);
    const key = trainerKey(row);
    if (expected.has(key)) errors.push(`${label}: 名簿位置が重複しています`);
    expected.set(key, row);
  }
  const seen = new Set();
  for (const trainer of data.trainers) {
    const label = `手持ち ${trainer.page ?? "?"} (${trainer.region ?? "?"}/${trainer.order ?? "?"})`;
    const key = trainerKey(trainer);
    const row = expected.get(key);
    if (!row) errors.push(`${label}: 名簿にないトレーナーです`);
    if (seen.has(key)) errors.push(`${label}: 名簿位置が重複しています`);
    seen.add(key);
    if (row) for (const field of ["ja", "role", "region", "order"]) {
      if (trainer[field] !== row[field]) errors.push(`${label}: ${field}が名簿メタデータと不一致`);
    }
    if (!ROLES.has(trainer.role)) errors.push(`${label}: 未知のrole ${trainer.role}`);
    if (!Array.isArray(trainer.parties)) {
      errors.push(`${label}: parties配列が必要です`);
      continue;
    }
    for (const [index, party] of trainer.parties.entries()) {
      if (Object.hasOwn(party, "title_ja") && !nonempty(party.title_ja)) errors.push(`${label} party${index}: title_jaは空でない文字列が必要です`);
    }
  }
  for (const [key, row] of expected) if (!seen.has(key)) errors.push(`手持ち: 名簿の${row.ja} (${row.region}/${row.order})が欠落しています`);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const roster = read("trainers/elite-four-roster.json");
  const errors = validateEliteFour(read("trainers/elite-four.json"), roster);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`四天王・チャンピオン検証成功: 名簿${roster.trainers.length}名`);
  }
}
