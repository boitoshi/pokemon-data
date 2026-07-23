// 配信ポケモン正本 P2c: champions.json 生成
//
// 変換元: pokebros-tools/tools/summary-pages/src/data/pokemon.json の
//         managementId が "CH" で始まる21件（Pokémon Champions配布・バトルパス報酬）。
//         ※非CHの5件（優勝配布）はP2dで別途扱うため今回は対象外。
// 出力先: distributions/champions.json
//
// 実行: node scripts/migrate-champions.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const SOURCE_PATH = path.join(
  root,
  "..",
  "pokebros-tools",
  "tools",
  "summary-pages",
  "src",
  "data",
  "pokemon.json"
);

const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const titles = readJson("games/titles.json");
const titleIds = new Set(titles.map((t) => t.id));

if (!titleIds.has("pokemon_champions")) {
  throw new Error('"pokemon_champions" が games/titles.json に存在しません');
}

const OT_PLAYER_MARKER = "(プレイヤーのもの)";
const IVS_FIXED_MARKER = "31固定（個体値廃止）";
const LEVEL_NOTE_MARKER = "Lv.50相当(非表示)";

// championsには無い想定だが保険（migrate-from-app.mjsと同じ許容）
const FORM_RE = /^(.+?)[（(](.+?)[)）]$/;

const OUTPUT_KEY_ORDER = [
  "id",
  "dexNo",
  "pokemonName",
  "form",
  "games",
  "eventName",
  "event",
  "distributionMethod",
  "distributionLocation",
  "startDate",
  "endDate",
  "region",
  "level",
  "levelNote",
  "gender",
  "nature",
  "ability",
  "ball",
  "metLocation",
  "heldItem",
  "teraType",
  "shiny",
  "ot",
  "otFromPlayer",
  "trainerId",
  "moves",
  "specialMoves",
  "ribbons",
  "ivs",
  "ivsGuaranteed",
  "evs",
  "gigantamax",
  "alpha",
  "password",
  "notes",
  "postUrl",
  "source",
];

function orderEntry(entry) {
  const ordered = {};
  for (const key of OUTPUT_KEY_ORDER) {
    if (key in entry) ordered[key] = entry[key];
  }
  const extraKeys = Object.keys(entry).filter((k) => !OUTPUT_KEY_ORDER.includes(k));
  if (extraKeys.length > 0) {
    throw new Error(`未知の出力キー: ${extraKeys.join(", ")}`);
  }
  return ordered;
}

// ---- バトルパスID正規化: "CH-BP-M-2-01" → "CH-BP-M2-01"（M1系は既に正しい形なので不変） ----
function normalizeId(rawId) {
  return rawId.replace(/CH-BP-M-(\d)-/, "CH-BP-M$1-");
}

function convertPokemonName(rawName) {
  const m = rawName.match(FORM_RE);
  if (m) {
    return { pokemonName: m[1], form: m[2] };
  }
  return { pokemonName: rawName };
}

// moves は "A, B, C, D" のカンマ区切り文字列
function convertMoves(rawMoves) {
  if (!rawMoves) return undefined;
  const parts = rawMoves
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return parts.length > 0 ? parts : undefined;
}

// ---- ribbon/あかし 正規化（migrate-from-app.mjsと同じ表記統一。現状championsのribbonsは全件空だが保険） ----
const RIBBON_FIX_MAP = {
  おもいでリボン: "メモリアルリボン",
  バースデイリボン: "バースデーリボン",
  チャンピオンリボン: "バトルチャンプリボン",
  うきうきしたあかし: "きたいのあかし",
  カリスマなあかし: "カリスマのあかし",
  げんきいっぱいのあかし: "げんきのあかし",
  ときどきみかけるあかし: "ときどきみるあかし",
  わくわくしたあかし: "かいちょうのあかし",
  きょうぼうなあかし: "ほんのうのあかし",
};

// ribbons は文字列（ほぼ""）。カンマ区切りの可能性に備えて分割・正規化する
function convertRibbons(rawRibbons) {
  if (!rawRibbons) return undefined;
  const parts = rawRibbons
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== "Unknown")
    .map((s) => RIBBON_FIX_MAP[s] ?? s);
  return parts.length > 0 ? parts : undefined;
}

function convertRegion(rawRegion) {
  if (!rawRegion) return undefined;
  const parts = [];
  for (const part of rawRegion.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    if (!parts.includes(trimmed)) parts.push(trimmed);
  }
  return parts.length > 0 ? parts : undefined;
}

function convertShiny(rawShiny, id) {
  if (!rawShiny) return undefined;
  if (rawShiny === "あり" || rawShiny === "色違い") return "fixed";
  throw new Error(`未知の shiny 値 "${rawShiny}" (id=${id})`);
}

function convertOt(rawOt) {
  if (!rawOt) return {};
  if (rawOt === OT_PLAYER_MARKER) return { otFromPlayer: true };
  if (typeof rawOt === "object" && rawOt !== null && !Array.isArray(rawOt)) {
    return { ot: rawOt };
  }
  return { ot: { JPN: String(rawOt) } };
}

// trainerId "(プレイヤーのもの)" はプレイヤー本人マーカーで実IDではないためドロップ（ot側のotFromPlayerで表現済み）
function convertTrainerId(rawTrainerId) {
  if (!rawTrainerId || rawTrainerId === OT_PLAYER_MARKER) return undefined;
  return String(rawTrainerId);
}

// level は "" か "Lv.50相当(非表示)" の2値のみ想定。それ以外はTHROWして報告
function convertLevel(rawLevel, id) {
  if (!rawLevel) return {};
  if (rawLevel === LEVEL_NOTE_MARKER) return { levelNote: rawLevel };
  throw new Error(`未知の level 値 "${rawLevel}" (id=${id})`);
}

// ivs は "" か "31固定（個体値廃止）" の2値のみ想定。それ以外はTHROWして報告
function convertIvs(rawIvs, id) {
  if (!rawIvs) return {};
  if (rawIvs === IVS_FIXED_MARKER) return { ivsGuaranteed: 6 };
  throw new Error(`未知の ivs 値 "${rawIvs}" (id=${id})`);
}

// metLocation "-" はプレースホルダなので省略
function convertMetLocation(rawMetLocation) {
  if (!rawMetLocation || rawMetLocation === "-") return undefined;
  return rawMetLocation;
}

function convertGigantamax(rawValue) {
  return rawValue === "キョダイマックス" ? true : undefined;
}

// isAlpha → alpha（キー名変更）。現状データは全件空で非空パターン未検証
function convertAlpha(rawValue) {
  return rawValue ? true : undefined;
}

const tournamentTypeAnomalies = [];

function convertEvent(entry) {
  if (entry.tournamentType !== "Champions") {
    tournamentTypeAnomalies.push({ id: entry.managementId, value: entry.tournamentType });
  }
  const event = { kind: "champions" };
  if (entry.tournamentYear) event.year = entry.tournamentYear;
  if (entry.tournamentSchedule) event.schedule = entry.tournamentSchedule;
  if (entry.tournamentLocation) event.location = entry.tournamentLocation;
  if (entry.winner) event.winner = entry.winner;
  if (entry.winnerX) event.winnerX = entry.winnerX;
  return event;
}

function convertEntry(entry) {
  const out = {};

  out.id = normalizeId(entry.managementId);
  out.dexNo = entry.dexNo;

  Object.assign(out, convertPokemonName(entry.pokemonName));

  if (entry.game !== "Pokémon Champions") {
    throw new Error(`未知の game 値 "${entry.game}" (id=${entry.managementId})`);
  }
  out.games = ["pokemon_champions"];

  out.eventName = entry.eventName;
  out.event = convertEvent(entry);

  if (!entry.distributionMethod) {
    throw new Error(`distributionMethod が空です (id=${entry.managementId})`);
  }
  out.distributionMethod = entry.distributionMethod;
  if (entry.distributionLocation) out.distributionLocation = entry.distributionLocation;

  out.startDate = entry.startDate;
  if (entry.endDate) out.endDate = entry.endDate;

  const region = convertRegion(entry.region);
  if (region) out.region = region;

  Object.assign(out, convertLevel(entry.level, entry.managementId));

  if (entry.gender) out.gender = entry.gender;
  if (entry.nature) out.nature = entry.nature;
  if (entry.ability) out.ability = entry.ability;
  if (entry.ball) out.ball = entry.ball;

  const metLocation = convertMetLocation(entry.metLocation);
  if (metLocation) out.metLocation = metLocation;

  if (entry.heldItem) out.heldItem = entry.heldItem;
  if (entry.teraType) out.teraType = entry.teraType;

  const shiny = convertShiny(entry.shiny, entry.managementId);
  if (shiny) out.shiny = shiny;

  Object.assign(out, convertOt(entry.ot));

  const trainerId = convertTrainerId(entry.trainerId);
  if (trainerId) out.trainerId = trainerId;

  const moves = convertMoves(entry.moves);
  if (moves) out.moves = moves;

  const ribbons = convertRibbons(entry.ribbons);
  if (ribbons) out.ribbons = ribbons;

  Object.assign(out, convertIvs(entry.ivs, entry.managementId));

  if (entry.evs) out.evs = entry.evs;

  const gigantamax = convertGigantamax(entry.gigantamax);
  if (gigantamax) out.gigantamax = gigantamax;
  const alpha = convertAlpha(entry.isAlpha);
  if (alpha) out.alpha = alpha;

  if (entry.password) out.password = entry.password;
  if (entry.notes) out.notes = entry.notes;
  if (entry.postUrl) out.postUrl = entry.postUrl;

  return orderEntry(out);
}

const champions = source.filter((e) => typeof e.managementId === "string" && e.managementId.startsWith("CH"));

const converted = champions.map((e) => convertEntry(e));

// id一意性の防御的検査（正規化後の衝突が万一あれば止める）
const idSet = new Set();
for (const e of converted) {
  if (idSet.has(e.id)) {
    throw new Error(`champions.json: id "${e.id}" が重複しています`);
  }
  idSet.add(e.id);
}

const battlePassNormalized = converted.filter((e) => e.id.startsWith("CH-BP-")).map((e) => e.id);

const payload = {
  schemaVersion: 1,
  dataset: "champions",
  generation: null,
  provenance: "spreadsheet",
  entries: converted,
};

const outPath = path.join(root, "distributions", "champions.json");
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

console.log("migrate-champions: 完了");
console.log(`  champions: ${converted.length}件 -> ${path.relative(root, outPath)}`);
console.log(`  バトルパスID: ${battlePassNormalized.join(", ")}`);

if (tournamentTypeAnomalies.length > 0) {
  console.log(`\n[想定外] tournamentType が "Champions" 以外（${tournamentTypeAnomalies.length}件）:`);
  for (const a of tournamentTypeAnomalies) {
    console.log(`  - id=${a.id}: ${JSON.stringify(a.value)}`);
  }
} else {
  console.log("\ntournamentType異常値の検出: なし");
}
