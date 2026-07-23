// 配信ポケモン正本 P2a/P2b: Gen7-9 変換（app由来）
//
// 変換元: pokemon-distribution-app/public/pokemon.json (674件、.generation で0/5-9混在、変換後スキーマ)
//
// P2a: generation===8/9 は全件をappから変換し、distributions/gen8.json・gen9.json を毎回フル再生成する（冪等）。
// P2b: generation===7 は distributions/gen7.json（bulbapediaスクレイプ由来69件）に対し、
//      appにしか無いid（app-only）だけを変換して末尾に追記マージする。既存69件・envelopeは維持。
//      再実行時は追記済みidが既存扱いになるため新規追記0件＝冪等。
//
// migrate-gen5-7.mjs を下敷きにしつつ、app固有スキーマの差分（game文字列→games配列、ot/ivsの
// オブジェクト直値許容、shiny/gigantamax/alpha等のapp側表記）を吸収する。
//
// 実行: node scripts/migrate-from-app.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const SOURCE_PATH = path.join(root, "..", "pokemon-distribution-app", "public", "pokemon.json");

const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const titles = readJson("games/titles.json");
const titleIds = new Set(titles.map((t) => t.id));

// ---- game 変換マップ（app の JP/英表記 → games/titles.json の id） ----
const GAME_MAP = {
  サン: "sun",
  ムーン: "moon",
  ウルトラサン: "ultra_sun",
  ウルトラムーン: "ultra_moon",
  ソード: "sword",
  シールド: "shield",
  ブリリアントダイヤモンド: "brilliant_diamond",
  シャイニングパール: "shining_pearl",
  ブリアントダイヤモンド: "brilliant_diamond", // タイポ救済
  レジェンズアルセウス: "legends_arceus",
  "Pokémon LEGENDS アルセウス": "legends_arceus",
  スカーレット: "scarlet",
  バイオレット: "violet",
  ZA: "legends_za",
  "Pokémon LEGENDS Z-A": "legends_za",
};

// 起動時に一度、マップの全ターゲットIDが titles.json に存在することを検証する
const allMappedIds = new Set(Object.values(GAME_MAP));
for (const id of allMappedIds) {
  if (!titleIds.has(id)) {
    throw new Error(`GAME_MAP のターゲットID "${id}" が games/titles.json に存在しません`);
  }
}

// 全角カッコに加え半角カッコも許容する（app側ソースに半角カッコ表記のフォルム名が混在するため）
const FORM_RE = /^(.+?)[（(](.+?)[)）]$/;
const OT_PLAYER_MARKER = "(プレイヤーのもの)";

// ---- pokemonName 正規化（フォルム抽出の前段で適用。app側の半角文字混入をマスターの全角表記に統一） ----
const POKEMON_NAME_FIX_MAP = {
  ポリゴンZ: "ポリゴンＺ",
  ポリゴン2: "ポリゴン２",
};

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

function convertGames(rawGame, managementId) {
  const result = [];
  for (const raw of rawGame.split(/[,，]/)) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const mapped = GAME_MAP[trimmed];
    if (!mapped) {
      throw new Error(`未知の game 値 "${trimmed}" (managementId=${managementId})`);
    }
    if (!result.includes(mapped)) result.push(mapped);
  }
  return result;
}

function convertRegion(rawRegion) {
  if (!rawRegion) return undefined;
  const parts = [];
  for (const part of rawRegion.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const fixed = REGION_FIX_MAP[trimmed] ?? trimmed;
    if (!parts.includes(fixed)) parts.push(fixed);
  }
  return parts.length > 0 ? parts : undefined;
}

function convertShiny(rawShiny, managementId) {
  if (rawShiny === "" || rawShiny === undefined) return undefined;
  if (rawShiny === "あり" || rawShiny === "色違い") return "fixed";
  throw new Error(`未知の shiny 値 "${rawShiny}" (managementId=${managementId})`);
}

function convertOt(rawOt, managementId) {
  if (rawOt === undefined || rawOt === "") return {};
  if (rawOt === OT_PLAYER_MARKER) return { otFromPlayer: true };
  if (typeof rawOt === "object" && rawOt !== null && !Array.isArray(rawOt)) {
    return { ot: rawOt };
  }
  if (typeof rawOt === "string") {
    return { ot: { JPN: rawOt } };
  }
  throw new Error(`未知の ot 型 (managementId=${managementId}): ${JSON.stringify(rawOt)}`);
}

function convertLevel(rawLevel) {
  if (rawLevel === "" || rawLevel === null || rawLevel === undefined) return {};
  if (typeof rawLevel === "number") return { level: rawLevel };
  const trimmed = String(rawLevel).trim();
  if (trimmed === "") return {};
  const parsed = parseInt(trimmed, 10);
  if (!Number.isNaN(parsed) && String(parsed) === trimmed) {
    return { level: parsed };
  }
  return { levelNote: trimmed };
}

function convertIvs(rawIvs, managementId) {
  if (rawIvs === undefined || rawIvs === "") return {};
  if (typeof rawIvs === "object" && rawIvs !== null && !Array.isArray(rawIvs)) {
    return { ivs: rawIvs };
  }
  if (typeof rawIvs === "string") {
    if (rawIvs === "ランダム") return {};
    const m = rawIvs.match(/^(\d)V$/);
    if (m) return { ivsGuaranteed: Number(m[1]) };
    throw new Error(`未知の ivs 文字列値 "${rawIvs}" (managementId=${managementId})`);
  }
  throw new Error(`未知の ivs 型 (managementId=${managementId}): ${JSON.stringify(rawIvs)}`);
}

function convertPokemonName(rawName) {
  const normalized = POKEMON_NAME_FIX_MAP[rawName] ?? rawName;
  const m = normalized.match(FORM_RE);
  if (m) {
    return { pokemonName: m[1], form: m[2] };
  }
  return { pokemonName: normalized };
}

function convertGigantamax(rawValue) {
  return rawValue === "キョダイマックス" ? true : undefined;
}

function convertAlpha(rawValue) {
  return rawValue === "オヤブン" ? true : undefined;
}

// ---- 値正規化（ability側はmigrate-gen5-7から流用。nature/distributionMethodはapp固有の表記ゆれ・typo救済） ----
const FIX_MAP = {
  ability: {
    "ＡＲシステム": "ARシステム", // 全角→半角。abilities/all.json の name_ja 正典表記に合わせる
  },
  nature: {
    すなお: "すなおな", // mappings/natures.json の正典表記（Docile）に合わせる
  },
  distributionMethod: {
    配信会場: "配布会場", // typo救済（信→布）。mappings/distribution-methods.json の正典表記に合わせる
  },
};

function applyFixMap(field, value) {
  const map = FIX_MAP[field];
  if (map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  return value;
}

// ---- region トークン正規化（app固有。表記ゆれをmappings/regions.jsonの正典表記へ統一） ----
const REGION_FIX_MAP = {
  米国: "アメリカ",
};

// ---- ribbon/あかし 正規化（app固有。旧名・タイポをmappings/ribbons.jsonの正典表記へ統一） ----
const RIBBON_FIX_MAP = {
  おもいでリボン: "メモリアルリボン",
  バースデイリボン: "バースデーリボン",
  チャンピオンリボン: "バトルチャンプリボン", // 対象は全てGen9のVGC選手配布＝バトルチャンプで確定
  うきうきしたあかし: "きたいのあかし",
  カリスマなあかし: "カリスマのあかし",
  げんきいっぱいのあかし: "げんきのあかし",
  ときどきみかけるあかし: "ときどきみるあかし",
  わくわくしたあかし: "かいちょうのあかし",
  きょうぼうなあかし: "ほんのうのあかし",
};

function convertRibbons(rawRibbons) {
  if (!Array.isArray(rawRibbons) || rawRibbons.length === 0) return undefined;
  const result = [];
  for (const r of rawRibbons) {
    if (r === "Unknown") continue; // ドロップ
    result.push(RIBBON_FIX_MAP[r] ?? r);
  }
  return result.length > 0 ? result : undefined;
}

// ---- 想定外検知用の集計（THROWせず報告のみ） ----
const specialMovesAnomalies = [];
const tournamentFieldHits = [];

function convertSpecialMoves(rawSpecialMoves, managementId) {
  if (Array.isArray(rawSpecialMoves) && rawSpecialMoves.length > 0) return rawSpecialMoves;
  if (rawSpecialMoves !== undefined && rawSpecialMoves !== "" && !Array.isArray(rawSpecialMoves)) {
    specialMovesAnomalies.push({ id: managementId, value: rawSpecialMoves });
  }
  return undefined;
}

const TOURNAMENT_FIELD_RE = /tournament/i;
function checkTournamentFields(entry) {
  for (const key of Object.keys(entry)) {
    if (TOURNAMENT_FIELD_RE.test(key) || key === "winner" || key === "winnerX") {
      tournamentFieldHits.push({ id: entry.managementId, key, value: entry[key] });
    }
  }
}

function convertEntry(entry) {
  checkTournamentFields(entry);

  const out = {};

  out.id = entry.managementId;
  out.dexNo = entry.dexNo;

  Object.assign(out, convertPokemonName(entry.pokemonName));

  out.games = convertGames(entry.game, entry.managementId);

  out.eventName = entry.eventName;

  if (!entry.distributionMethod || entry.distributionMethod === "") {
    throw new Error(`distributionMethod が空です (managementId=${entry.managementId})`);
  }
  out.distributionMethod = applyFixMap("distributionMethod", entry.distributionMethod);
  if (entry.distributionLocation) out.distributionLocation = entry.distributionLocation;

  out.startDate = entry.startDate;
  if (entry.endDate) out.endDate = entry.endDate;

  const region = convertRegion(entry.region);
  if (region) out.region = region;

  Object.assign(out, convertLevel(entry.level));

  if (entry.gender) out.gender = entry.gender;
  if (entry.nature) out.nature = applyFixMap("nature", entry.nature);
  if (entry.ability) out.ability = applyFixMap("ability", entry.ability);
  if (entry.ball) out.ball = entry.ball;
  if (entry.metLocation) out.metLocation = entry.metLocation;
  if (entry.heldItem) out.heldItem = entry.heldItem;
  if (entry.teraType) out.teraType = entry.teraType;

  const shiny = convertShiny(entry.shiny, entry.managementId);
  if (shiny) out.shiny = shiny;

  Object.assign(out, convertOt(entry.ot, entry.managementId));

  if (entry.trainerId !== undefined && entry.trainerId !== "") out.trainerId = String(entry.trainerId);

  if (Array.isArray(entry.moves) && entry.moves.length > 0) out.moves = entry.moves;

  const specialMoves = convertSpecialMoves(entry.specialMoves, entry.managementId);
  if (specialMoves) out.specialMoves = specialMoves;

  const ribbons = convertRibbons(entry.ribbons);
  if (ribbons) out.ribbons = ribbons;

  Object.assign(out, convertIvs(entry.ivs, entry.managementId));

  if (entry.evs) out.evs = entry.evs;

  const gigantamax = convertGigantamax(entry.gigantamax);
  if (gigantamax) out.gigantamax = gigantamax;
  const alpha = convertAlpha(entry.alpha);
  if (alpha) out.alpha = alpha;

  if (entry.password) out.password = entry.password;
  if (entry.notes) out.notes = entry.notes;
  if (entry.postUrl) out.postUrl = entry.postUrl;

  return orderEntry(out);
}

// P2a: フル再生成（毎回appのgeneration===N全件を変換して書き出す。冪等）
const FULL_REGEN_CONFIG = [
  { generation: 8, dataset: "gen8" },
  { generation: 9, dataset: "gen9" },
];

// P2b: マージ（既存distributions/{dataset}.jsonを読み、app-only分だけ変換して末尾に追記。envelope維持。冪等）
const MERGE_CONFIG = [{ generation: 7, dataset: "gen7" }];

const formIds = [];
const summary = [];

for (const { generation, dataset } of FULL_REGEN_CONFIG) {
  const genEntries = source.filter((e) => e.generation === generation);
  const converted = genEntries.map((e) => {
    const out = convertEntry(e);
    if (out.form) formIds.push(out.id);
    return out;
  });

  const payload = {
    schemaVersion: 1,
    dataset,
    generation,
    provenance: "spreadsheet-migration",
    entries: converted,
  };

  const outPath = path.join(root, "distributions", `${dataset}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  summary.push({ dataset, count: converted.length, outPath, mode: "full-regen" });
}

for (const { generation, dataset } of MERGE_CONFIG) {
  const outPath = path.join(root, "distributions", `${dataset}.json`);
  const existingPayload = JSON.parse(fs.readFileSync(outPath, "utf8"));
  if (existingPayload.dataset !== dataset || existingPayload.generation !== generation) {
    throw new Error(
      `${dataset}.json のenvelopeが想定と異なります (dataset=${existingPayload.dataset}, generation=${existingPayload.generation})`
    );
  }

  const existingIds = new Set(existingPayload.entries.map((e) => e.id));
  const appOnlyEntries = source.filter((e) => e.generation === generation && !existingIds.has(e.managementId));
  const converted = appOnlyEntries.map((e) => {
    const out = convertEntry(e);
    if (out.form) formIds.push(out.id);
    return out;
  });

  const mergedEntries = [...existingPayload.entries, ...converted];

  // マージ後のid一意性を防御的に検査（既存69件とapp-only分の衝突が万一あれば止める）
  const idSet = new Set();
  for (const e of mergedEntries) {
    if (idSet.has(e.id)) {
      throw new Error(`${dataset}.json: マージ後にid "${e.id}" が重複しています`);
    }
    idSet.add(e.id);
  }

  const payload = {
    schemaVersion: existingPayload.schemaVersion,
    dataset: existingPayload.dataset,
    generation: existingPayload.generation,
    provenance: existingPayload.provenance,
    entries: mergedEntries,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  summary.push({
    dataset,
    count: mergedEntries.length,
    outPath,
    mode: "merge",
    existing: existingPayload.entries.length,
    appended: converted.length,
  });
}

console.log("migrate-from-app: 完了");
for (const s of summary) {
  if (s.mode === "merge") {
    console.log(`  ${s.dataset}: ${s.count}件 (既存${s.existing}件 + app-only追記${s.appended}件) -> ${path.relative(root, s.outPath)}`);
  } else {
    console.log(`  ${s.dataset}: ${s.count}件 -> ${path.relative(root, s.outPath)}`);
  }
}
console.log(`  合計: ${summary.reduce((a, s) => a + s.count, 0)}件`);
console.log(`  フォルム抽出: ${formIds.length}件 [${formIds.join(", ")}]`);

if (specialMovesAnomalies.length > 0) {
  console.log(`\n[想定外] specialMoves が配列でない値（省略扱い・${specialMovesAnomalies.length}件）:`);
  for (const a of specialMovesAnomalies) {
    console.log(`  - id=${a.id}: ${JSON.stringify(a.value)}`);
  }
}

if (tournamentFieldHits.length > 0) {
  console.log(`\n[想定外] tournament系フィールドを検出（${tournamentFieldHits.length}件）:`);
  for (const t of tournamentFieldHits) {
    console.log(`  - id=${t.id}: ${t.key}=${JSON.stringify(t.value)}`);
  }
} else {
  console.log("\ntournament系フィールドの検出: なし");
}
