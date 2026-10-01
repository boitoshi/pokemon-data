// 名簿を集合の正本として、ジムリーダーの取得結果を照合する。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const JAPANESE = /[ぁ-んァ-ヶ一-龯]/u;
const PWT = /\bPWT\b|Pok[eé]mon World Tournament|ポケモンワールドトーナメント/i;
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const japanese = (value) => nonempty(value) && JAPANESE.test(value) && !/未確認|不明|unknown|undefined/i.test(value);

/** 名簿の必須項目・参照元・重複とマスター値を検査する。 */
export function validateRoster(roster, masters) {
  const errors = [];
  if (roster?.source !== "https://bulbapedia.bulbagarden.net/wiki/Gym_Leader") errors.push("名簿: sourceはGym_Leader資料URLが必要です");
  if (!nonempty(roster?.scope)) errors.push("名簿: scopeが必要です");
  if (!Array.isArray(roster?.trainers) || roster.trainers.length === 0) return [...errors, "名簿: trainersが空です"];
  const pages = new Set();
  const orders = new Map();
  for (const row of roster.trainers) {
    const label = `名簿 ${row.page ?? "?"}`;
    if (!nonempty(row.page) || /[\r\n#]/.test(row.page)) errors.push(`${label}: page参照が不正です`);
    if (pages.has(row.page)) errors.push(`${label}: page重複`);
    pages.add(row.page);
    if (!japanese(row.ja)) errors.push(`${label}: 日本語名が必要です`);
    if (!masters.regions.has(row.region)) errors.push(`${label}: 未知の地方 ${row.region}`);
    if (!Number.isInteger(row.order) || row.order < 1) errors.push(`${label}: orderは正の整数が必要です`);
    if (!orders.has(row.region)) orders.set(row.region, []);
    orders.get(row.region).push(row.order);
    if (row.type_en !== "Various" && !masters.types.has(row.type_en?.toLowerCase())) errors.push(`${label}: 未知の専門タイプ ${row.type_en}`);
    if (row.allowed_rematches !== undefined) {
      if (!Array.isArray(row.allowed_rematches)) errors.push(`${label}: allowed_rematchesは配列が必要です`);
      else {
        const seenRematches = new Set();
        for (const rematch of row.allowed_rematches) {
          if (!nonempty(rematch?.section) || !nonempty(rematch?.location)) errors.push(`${label}: 再戦例外にはsection/locationが必要です`);
          const key = JSON.stringify([rematch?.section, rematch?.location]);
          if (seenRematches.has(key)) errors.push(`${label}: 再戦例外が重複しています`);
          seenRematches.add(key);
        }
      }
    }
  }
  for (const [region, values] of orders) {
    const sorted = values.toSorted((a, b) => a - b);
    if (sorted.some((value, i) => value !== i + 1)) errors.push(`名簿 ${region}: orderが重複または不連続です`);
  }
  return errors;
}

/** 取得結果が名簿と一致し、空手持ち・PWT・未翻訳値を含まないことを検査する。 */
export function validateGymLeaders(data, roster, masters) {
  const errors = [];
  if (!nonempty(data?.source) || !/Bulbapedia|bulbapedia\.bulbagarden\.net/i.test(data.source)) errors.push("手持ち: Bulbapediaのsourceポインタが必要です");
  if (!Array.isArray(data?.trainers)) return [...errors, "手持ち: trainers配列が必要です"];
  const expected = new Map(roster.trainers.map((row) => [row.page, row]));
  const seen = new Set();
  for (const trainer of data.trainers) {
    const label = `手持ち ${trainer.page ?? "?"}`;
    const row = expected.get(trainer.page);
    if (!row) errors.push(`${label}: 名簿にないpageです`);
    if (seen.has(trainer.page)) errors.push(`${label}: page重複`);
    seen.add(trainer.page);
    if (row && ["ja", "region", "order", "type_en"].some((key) => trainer[key] !== row[key])) errors.push(`${label}: 名簿メタデータと不一致`);
    if (trainer.role !== "gym_leader") errors.push(`${label}: roleはgym_leaderが必要です`);
    if (!japanese(trainer.type_ja) || !japanese(trainer.role_ja)) errors.push(`${label}: 専門タイプ・役割の日本語表示が必要です`);
    if (!Array.isArray(trainer.parties) || trainer.parties.length === 0) {
      errors.push(`${label}: partiesが空です`);
      continue;
    }
    for (const [index, party] of trainer.parties.entries()) {
      const where = `${label} party${index}`;
      if (!nonempty(party.game) || !nonempty(party.section)) errors.push(`${where}: game/section参照が必要です`);
      if (!nonempty(party.game_ja)) errors.push(`${where}: game_jaが必要です`);
      if (!nonempty(party.section_ja)) errors.push(`${where}: section_jaが必要です`);
      else if (!japanese(party.section_ja) && party.section_needs_review !== true) errors.push(`${where}: 日本語未確認のsectionにはsection_needs_reviewが必要です`);
      if (!Array.isArray(party.section_path) || party.section_path.length === 0 || party.section_path.some((value) => !nonempty(value))) errors.push(`${where}: section_path見出し参照が必要です`);
      const ancestors = Array.isArray(party.section_path) ? party.section_path : [];
      if ([party.location, party.location_ja, party.section, party.game, ...ancestors].some((value) => typeof value === "string" && PWT.test(value))) errors.push(`${where}: PWTが混入しています`);
      if (!Array.isArray(party.team) || party.team.length === 0) {
        errors.push(`${where}: teamが空です`);
        continue;
      }
      for (const [memberIndex, member] of party.team.entries()) {
        const memberWhere = `${where} member${memberIndex}`;
        const master = masters.pokemon[String(Number(member.ndex))];
        if (!master || member.ja !== master.name_ja) errors.push(`${memberWhere}: ポケモン日本語名と全国図鑑番号がマスター不一致`);
        if (!Array.isArray(member.moves) || member.moves.length === 0) errors.push(`${memberWhere}: movesが空です`);
        else for (const move of member.moves) if (!japanese(move.ja)) errors.push(`${memberWhere}: 技の日本語名が未変換です (${move.en ?? "?"})`);
      }
    }
  }
  for (const page of expected.keys()) if (!seen.has(page)) errors.push(`手持ち: 名簿の${page}が欠落しています`);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const masters = {
    pokemon: read("pokemon/all.json"),
    types: new Set(Object.keys(read("mappings/types.json"))),
    regions: new Set(read("games/titles.json").map((game) => game.region).filter(Boolean)),
  };
  const roster = read("trainers/gym-leader-roster.json");
  const errors = validateRoster(roster, masters);
  const dataPath = "trainers/gym-leaders.json";
  if (fs.existsSync(dataPath) && errors.length === 0) errors.push(...validateGymLeaders(read(dataPath), roster, masters));
  else if (!fs.existsSync(dataPath)) console.log("ジムリーダー手持ち: 未生成のため名簿のみ検証");
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`ジムリーダー検証成功: 名簿${roster.trainers.length}名・${new Set(roster.trainers.map((row) => row.region)).size}地方`);
  }
}
