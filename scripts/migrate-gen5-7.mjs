// 配信ポケモン正本 P1: Gen5-7 変換
//
// 変換元: pokebros-tools/tools/summary-pages/src/data/pokemon-all.json (406件、.generation で5/6/7混在)
// 出力先: distributions/gen5.json / gen6.json / gen7.json
//
// 実行: node scripts/migrate-gen5-7.mjs

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
  "pokemon-all.json"
);

const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const titles = readJson("games/titles.json");
const titleIds = new Set(titles.map((t) => t.id));

// ---- game 変換マップ（source の JP表記 → games/titles.json の id） ----
const GAME_MAP = {
  X: ["x"],
  Y: ["y"],
  サン: ["sun"],
  ムーン: ["moon"],
  ウルトラサン: ["ultra_sun"],
  ウルトラムーン: ["ultra_moon"],
  オメガルビー: ["omegaruby"],
  アルファサファイア: ["alphasapphire"],
  ブラック: ["black"],
  ホワイト: ["white"],
  ブラック2: ["black2"],
  ホワイト2: ["white2"],
  "ピカチュウ（Let's Go）": ["lets_go_pikachu"],
  "イーブイ（Let's Go）": ["lets_go_eevee"],
  ピカブイ: ["lets_go_pikachu", "lets_go_eevee"],
};

// 起動時に一度、マップの全ターゲットIDが titles.json に存在することを検証する
const allMappedIds = new Set(Object.values(GAME_MAP).flat());
for (const id of allMappedIds) {
  if (!titleIds.has(id)) {
    throw new Error(`GAME_MAP のターゲットID "${id}" が games/titles.json に存在しません`);
  }
}

const FORM_RE = /^(.+?)（(.+)）$/;
const OT_PLAYER_MARKER = "(プレイヤーのもの)";
const OT_LANG_FIELDS = [
  ["JPN", "ot_JPN"],
  ["ENG", "ot_ENG"],
  ["SPA", "ot_SPA"],
  ["FRE", "ot_FRE"],
  ["GER", "ot_GER"],
  ["ITA", "ot_ITA"],
  ["KOR", "ot_KOR"],
  ["CHS", "ot_CHS"],
  ["CHT", "ot_CHT"],
  ["SPA_EU", "ot_SPA_EU"],
  ["SPA_LA", "ot_SPA_LA"],
];

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

function convertGames(rawGames, managementId) {
  const result = [];
  for (const raw of rawGames) {
    const mapped = GAME_MAP[raw];
    if (!mapped) {
      throw new Error(`未知の game 値 "${raw}" (managementId=${managementId})`);
    }
    for (const id of mapped) {
      if (!result.includes(id)) result.push(id);
    }
  }
  return result;
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

function convertShiny(rawShiny, managementId) {
  if (rawShiny === "") return undefined;
  if (rawShiny === "あり") return "fixed";
  if (rawShiny === "条件次第") return "conditional";
  throw new Error(`未知の shiny 値 "${rawShiny}" (managementId=${managementId})`);
}

function convertOt(entry) {
  if (entry.ot === OT_PLAYER_MARKER) {
    return { otFromPlayer: true };
  }
  const ot = {};
  const jpnValue = entry.ot_JPN || entry.ot;
  if (jpnValue) ot.JPN = jpnValue;
  for (const [langKey, fieldName] of OT_LANG_FIELDS) {
    if (langKey === "JPN") continue;
    const value = entry[fieldName];
    if (value) ot[langKey] = value;
  }
  return Object.keys(ot).length > 0 ? { ot } : {};
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

function convertIvs(entry) {
  const ivKeys = ["hp", "atk", "def", "spa", "spd", "spe"];
  const sourceKeys = {
    hp: "ivs_hp",
    atk: "ivs_atk",
    def: "ivs_def",
    spa: "ivs_spa",
    spd: "ivs_spd",
    spe: "ivs_spe",
  };
  const hasAny = ivKeys.some((k) => entry[sourceKeys[k]] !== null && entry[sourceKeys[k]] !== undefined);
  if (hasAny) {
    const ivs = {};
    for (const k of ivKeys) {
      const v = entry[sourceKeys[k]];
      if (v !== null && v !== undefined) {
        const num = Number(v);
        // Fable5レビュー由来のハードニング: サイレントにNaN→キー欠落させず文脈付きでthrow
        if (Number.isNaN(num)) {
          throw new Error(
            `convertIvs: ${sourceKeys[k]} の値 "${v}" が数値に変換できません (managementId=${entry.managementId})`
          );
        }
        ivs[k] = num;
      }
    }
    return { ivs };
  }
  const rawIvs = entry.ivs;
  const m = typeof rawIvs === "string" ? rawIvs.match(/^(\d)V$/) : null;
  if (m) {
    return { ivsGuaranteed: Number(m[1]) };
  }
  return {};
}

function convertPokemonName(rawName) {
  const m = rawName.match(FORM_RE);
  if (m) {
    return { pokemonName: m[1], form: m[2] };
  }
  return { pokemonName: rawName };
}

// Fable5レビュー由来のハードニング: 「非空なら無条件true」から明示ホワイトリストへ
// gen8のキョダイマックス等、実データ投入前の想定外表記を静かに拾わないための事故防止
const FLAG_FALSY_VALUES = new Set(["", "なし", "無", "×"]);
const FLAG_TRUTHY_VALUES = new Set(["あり"]);

function convertFlag(rawValue, fieldName, managementId) {
  if (FLAG_FALSY_VALUES.has(rawValue)) return undefined;
  if (FLAG_TRUTHY_VALUES.has(rawValue)) return true;
  throw new Error(`未知の ${fieldName} 値 "${rawValue}" (managementId=${managementId})`);
}

// ---- Fable5レビュー由来のデータ正規化 ----
// 変換元データの表記ゆれ・誤字をフィールドごとにピンポイントで正すマップ。
// 「いかく/だっぴ」（07150、複数特性の未確定表記）はP2でスキーマ対応するまで意図的に対象外。
const FIX_MAP = {
  ability: {
    "ＡＲシステム": "ARシステム", // 全角→半角。abilities/all.json の name_ja 正典表記に合わせる（対象07027/07028）
  },
  distributionMethod: {
    "Poké Ball Plus": "モンスターボール Plus", // mappings/distribution-methods.json の和訳に統一（対象07138）
  },
  // Fable5リボン監査由来: mappings/ribbons.json の正典表記へ統一（ribbons配列は要素単位で適用）
  ribbon: {
    "おもいでリボン": "メモリアルリボン", // 全世代・47件想定
    "チャンピオンリボン": "バトルチャンプリボン", // 5件想定＝05101/05102/06014/06191/07002
  },
};

function applyFixMap(field, value) {
  const map = FIX_MAP[field];
  if (map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  return value;
}

function convertEntry(entry) {
  const out = {};

  out.id = entry.managementId;
  out.dexNo = entry.dexNo;

  Object.assign(out, convertPokemonName(entry.pokemonName));

  out.games = convertGames(entry.game, entry.managementId);

  out.eventName = entry.eventName;

  // Fable5レビュー由来のハードニング: schemaの required と整合させ、省略でなくthrowする
  if (entry.distributionMethod === "") {
    throw new Error(`distributionMethod が空です (managementId=${entry.managementId})`);
  }
  out.distributionMethod = applyFixMap("distributionMethod", entry.distributionMethod);
  if (entry.distributionLocation !== "") out.distributionLocation = entry.distributionLocation;

  out.startDate = entry.startDate;
  if (entry.endDate !== "") out.endDate = entry.endDate;

  const region = convertRegion(entry.region);
  if (region) out.region = region;

  Object.assign(out, convertLevel(entry.level));

  if (entry.gender !== "") out.gender = entry.gender;
  if (entry.nature !== "") out.nature = entry.nature;
  if (entry.ability !== "") out.ability = applyFixMap("ability", entry.ability);
  if (entry.ball !== "") out.ball = entry.ball;
  if (entry.metLocation !== "") out.metLocation = entry.metLocation;
  if (entry.heldItem !== "") out.heldItem = entry.heldItem;
  if (entry.teraType !== "") out.teraType = entry.teraType;

  const shiny = convertShiny(entry.shiny, entry.managementId);
  if (shiny) out.shiny = shiny;

  Object.assign(out, convertOt(entry));

  if (entry.trainerId !== "") out.trainerId = entry.trainerId;

  if (Array.isArray(entry.moves) && entry.moves.length > 0) out.moves = entry.moves;
  if (Array.isArray(entry.specialMoves) && entry.specialMoves.length > 0) out.specialMoves = entry.specialMoves;
  if (Array.isArray(entry.ribbons) && entry.ribbons.length > 0) {
    out.ribbons = entry.ribbons.map((r) => applyFixMap("ribbon", r));
  }

  Object.assign(out, convertIvs(entry));

  if (entry.evs !== "") out.evs = entry.evs;

  const gigantamax = convertFlag(entry.gigantamax, "gigantamax", entry.managementId);
  if (gigantamax) out.gigantamax = gigantamax;
  const alpha = convertFlag(entry.alpha, "alpha", entry.managementId);
  if (alpha) out.alpha = alpha;

  if (entry.password !== "") out.password = entry.password;
  if (entry.notes !== "") out.notes = entry.notes;
  if (entry.postUrl !== "") out.postUrl = entry.postUrl;

  return orderEntry(out);
}

const GEN_CONFIG = [
  { generation: 5, dataset: "gen5" },
  { generation: 6, dataset: "gen6" },
  { generation: 7, dataset: "gen7" },
];

const formIds = [];
const summary = [];

for (const { generation, dataset } of GEN_CONFIG) {
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
    provenance: "scraper:bulbapedia",
    entries: converted,
  };

  const outPath = path.join(root, "distributions", `${dataset}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  summary.push({ dataset, count: converted.length, outPath });
}

console.log("migrate-gen5-7: 完了");
for (const s of summary) {
  console.log(`  ${s.dataset}: ${s.count}件 -> ${path.relative(root, s.outPath)}`);
}
console.log(`  合計: ${summary.reduce((a, s) => a + s.count, 0)}件`);
console.log(`  フォルム抽出: ${formIds.length}件 [${formIds.join(", ")}]`);
