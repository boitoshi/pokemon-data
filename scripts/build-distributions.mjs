// 配信ポケモン正本 P3a: build-distributions.mjs
//
// 正本 distributions/gen5.json..gen9.json + champions.json（L2）を読み、
// app-runtime schema（pokemon-distribution-app/public/pokemon.json 互換の1レコード形）へ
// 前方向生成する。migrate-gen5-7.mjs / migrate-from-app.mjs / migrate-champions.mjs の逆写像。
//
// 出力: build/pokemon.json（688件・配列トップレベル）, build/meta.json（サイドカー）
// 兄弟repoには書かない（P4でapp向け替え時に配線）。CI-safe＝自repoのマスターのみ読む。
//
// 実行: node scripts/build-distributions.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const titles = readJson("games/titles.json");
const titleIds = new Set(titles.map((t) => t.id));

// ---- REVERSE_GAME_MAP（games/titles.json の id → app-runtime表示用JP短縮名。migrate GAME_MAP の逆） ----
// titles.json の shortName は一致しないため明示ピン留め（P3-build-spec.md 正本）。
const REVERSE_GAME_MAP = {
  sun: "サン",
  moon: "ムーン",
  ultra_sun: "ウルトラサン",
  ultra_moon: "ウルトラムーン",
  x: "X",
  y: "Y",
  omegaruby: "オメガルビー",
  alphasapphire: "アルファサファイア",
  black: "ブラック",
  white: "ホワイト",
  black2: "ブラック2",
  white2: "ホワイト2",
  sword: "ソード",
  shield: "シールド",
  brilliant_diamond: "ブリリアントダイヤモンド",
  shining_pearl: "シャイニングパール",
  legends_arceus: "Pokémon LEGENDS アルセウス",
  legends_za: "ZA",
  scarlet: "スカーレット",
  violet: "バイオレット",
  pokemon_champions: "Pokémon Champions",
};

// 起動時に一度、マップの全ソースID（= distributions/*.json の games[] に現れうるid）が
// games/titles.json に存在することを検証する（migrate と対称の防御）。
for (const id of Object.keys(REVERSE_GAME_MAP)) {
  if (!titleIds.has(id)) {
    throw new Error(`REVERSE_GAME_MAP のソースID "${id}" が games/titles.json に存在しません`);
  }
}

// ---- 入力データセット定義 ----
const DATASETS = [
  { dataset: "gen5", file: "gen5.json" },
  { dataset: "gen6", file: "gen6.json" },
  { dataset: "gen7", file: "gen7.json" },
  { dataset: "gen8", file: "gen8.json" },
  { dataset: "gen9", file: "gen9.json" },
  { dataset: "champions", file: "champions.json" },
];

// ---- app-runtime 出力キー順（P3-build-spec.md 正本。不在は省略、順序はP4差分最小化のため踏襲） ----
const OUTPUT_KEY_ORDER = [
  "managementId",
  "pokemonName",
  "dexNo",
  "generation",
  "game",
  "eventName",
  "tournamentType",
  "tournamentYear",
  "tournamentSchedule",
  "tournamentLocation",
  "winner",
  "winnerX",
  "distributionMethod",
  "distributionLocation",
  "startDate",
  "endDate",
  "ot",
  "trainerId",
  "metLocation",
  "ball",
  "level",
  "gender",
  "ability",
  "nature",
  "heldItem",
  "moves",
  "ribbons",
  "password",
  "notes",
  "postUrl",
  "region",
  "shiny",
  "teraType",
  "ivs",
  "evs",
  "gigantamax",
  "alpha",
];

function orderRecord(record) {
  const ordered = {};
  for (const key of OUTPUT_KEY_ORDER) {
    if (key in record) ordered[key] = record[key];
  }
  const extraKeys = Object.keys(record).filter((k) => !OUTPUT_KEY_ORDER.includes(k));
  if (extraKeys.length > 0) {
    throw new Error(`未知の出力キー: ${extraKeys.join(", ")} (managementId=${record.managementId})`);
  }
  return ordered;
}

// ---- games[] → 表示用文字列（特例: ピカブイ/単独LGP/LGE をコンボ判定してから通常map） ----
function convertGames(games, managementId) {
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error(`games が空です (managementId=${managementId})`);
  }
  const idSet = new Set(games);
  if (idSet.size === 2 && idSet.has("lets_go_pikachu") && idSet.has("lets_go_eevee")) {
    return "ピカブイ";
  }
  if (idSet.size === 1 && idSet.has("lets_go_pikachu")) {
    return "ピカチュウ（Let's Go）";
  }
  if (idSet.size === 1 && idSet.has("lets_go_eevee")) {
    return "イーブイ（Let's Go）";
  }
  const names = games.map((id) => {
    const mapped = REVERSE_GAME_MAP[id];
    if (!mapped) {
      throw new Error(`未知の games id "${id}" (managementId=${managementId})`);
    }
    return mapped;
  });
  return names.join(", ");
}

// ---- pokemonName + form → "名前（フォルム）"（全角カッコ） ----
function convertPokemonName(entry) {
  if (entry.form) {
    return `${entry.pokemonName}（${entry.form}）`;
  }
  return entry.pokemonName;
}

// ---- ot: entry.ot(object)そのまま / entry.otFromPlayer → "(プレイヤーのもの)" / 無ければ省略 ----
const OT_PLAYER_MARKER = "(プレイヤーのもの)";
function convertOt(entry, managementId) {
  if (entry.otFromPlayer === true) return { ot: OT_PLAYER_MARKER };
  if (entry.ot !== undefined) {
    if (typeof entry.ot !== "object" || entry.ot === null || Array.isArray(entry.ot)) {
      throw new Error(`未知の ot 型 (managementId=${managementId}): ${JSON.stringify(entry.ot)}`);
    }
    // 単一JPNキーのみ → app互換の素の文字列で出力（app committed 554件がこの単一文字列形）。
    // 多言語（複数キー or 非JPN単一キー）→ object のまま passthrough（app committed 81件と一致）。
    const langKeys = Object.keys(entry.ot);
    if (langKeys.length === 1 && langKeys[0] === "JPN") {
      return { ot: entry.ot.JPN };
    }
    return { ot: entry.ot };
  }
  return {};
}

// ---- level: entry.level(number)優先 / entry.levelNote(string) / 両方無ければ省略 ----
function convertLevel(entry) {
  if (entry.level !== undefined) return { level: entry.level };
  if (entry.levelNote !== undefined) return { level: entry.levelNote };
  return {};
}

// ---- ivs: entry.ivs(object)そのまま / entry.ivsGuaranteed→"NV" / 両方無し→"ランダム"（常に出力） ----
function convertIvs(entry, managementId) {
  if (entry.ivs !== undefined) {
    if (typeof entry.ivs !== "object" || entry.ivs === null || Array.isArray(entry.ivs)) {
      throw new Error(`未知の ivs 型 (managementId=${managementId}): ${JSON.stringify(entry.ivs)}`);
    }
    return entry.ivs;
  }
  if (entry.ivsGuaranteed !== undefined) return `${entry.ivsGuaranteed}V`;
  return "ランダム";
}

// ---- shiny: "fixed"→"あり" / "conditional"→"条件次第" / 無ければ省略 ----
function convertShiny(entry, managementId) {
  if (entry.shiny === undefined) return undefined;
  if (entry.shiny === "fixed") return "あり";
  if (entry.shiny === "conditional") return "条件次第";
  throw new Error(`未知の shiny 値 "${entry.shiny}" (managementId=${managementId})`);
}

// ---- region[] → ","連結（スペース無し） ----
function convertRegion(entry) {
  if (!Array.isArray(entry.region) || entry.region.length === 0) return undefined;
  return entry.region.join(",");
}

// ---- tournament系: champions(gen0)のみ、entry.event から展開 ----
function convertTournamentFields(entry, managementId) {
  const event = entry.event;
  if (!event) return {};
  const out = {};
  out.tournamentType = event.kind === "champions" ? "Champions" : event.kind;
  if (event.year !== undefined) out.tournamentYear = event.year;
  if (event.schedule !== undefined) out.tournamentSchedule = event.schedule;
  if (event.location !== undefined) out.tournamentLocation = event.location;
  if (event.winner !== undefined) out.winner = event.winner;
  if (event.winnerX !== undefined) out.winnerX = event.winnerX;
  return out;
}

// ---- 未知キー検知（正本entryに想定外フィールドが増えたら握りつぶさずthrow） ----
const KNOWN_ENTRY_KEYS = new Set([
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
]);

function checkKnownKeys(entry, managementId) {
  const unknown = Object.keys(entry).filter((k) => !KNOWN_ENTRY_KEYS.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `想定外のフィールドを検出: ${unknown.join(", ")} (managementId=${managementId})。逆写像ルールの追加要否を確認してください。`
    );
  }
}

// specialMoves は正本に存在しない前提（app"あり"19件は文書化deviationとしてドロップ済み）。
// もし正本entryにspecialMovesが実在したら、握りつぶさず気づけるよう集計する。
const specialMovesFound = [];

function convertEntry(entry, generation, isChampions) {
  const managementId = entry.id;
  checkKnownKeys(entry, managementId);

  if (Array.isArray(entry.specialMoves) && entry.specialMoves.length > 0) {
    specialMovesFound.push({ id: managementId, value: entry.specialMoves });
  }

  const out = {};

  out.managementId = managementId;
  out.pokemonName = convertPokemonName(entry);
  out.dexNo = entry.dexNo;
  out.generation = generation;
  out.game = convertGames(entry.games, managementId);
  out.eventName = entry.eventName;

  if (isChampions) {
    Object.assign(out, convertTournamentFields(entry, managementId));
  } else if (entry.event !== undefined) {
    throw new Error(`champions以外のentryにeventフィールドがあります (managementId=${managementId})`);
  }

  out.distributionMethod = entry.distributionMethod;
  if (entry.distributionLocation !== undefined) out.distributionLocation = entry.distributionLocation;

  out.startDate = entry.startDate;
  if (entry.endDate !== undefined) out.endDate = entry.endDate;

  Object.assign(out, convertOt(entry, managementId));
  if (entry.trainerId !== undefined) out.trainerId = entry.trainerId;
  if (entry.metLocation !== undefined) out.metLocation = entry.metLocation;
  if (entry.ball !== undefined) out.ball = entry.ball;

  Object.assign(out, convertLevel(entry));

  if (entry.gender !== undefined) out.gender = entry.gender;
  if (entry.ability !== undefined) out.ability = entry.ability;
  if (entry.nature !== undefined) out.nature = entry.nature;
  if (entry.heldItem !== undefined) out.heldItem = entry.heldItem;

  if (Array.isArray(entry.moves) && entry.moves.length > 0) out.moves = entry.moves;
  if (Array.isArray(entry.ribbons) && entry.ribbons.length > 0) out.ribbons = entry.ribbons;

  if (entry.password !== undefined) out.password = entry.password;
  if (entry.notes !== undefined) out.notes = entry.notes;
  if (entry.postUrl !== undefined) out.postUrl = entry.postUrl;

  const region = convertRegion(entry);
  if (region !== undefined) out.region = region;

  const shiny = convertShiny(entry, managementId);
  if (shiny !== undefined) out.shiny = shiny;

  if (entry.teraType !== undefined) out.teraType = entry.teraType;

  out.ivs = convertIvs(entry, managementId);

  if (entry.evs !== undefined) out.evs = entry.evs;

  if (entry.gigantamax === true) out.gigantamax = "キョダイマックス";
  if (entry.alpha === true) out.alpha = "オヤブン";

  return orderRecord(out);
}

// ---- ビルド本体 ----
const records = [];
const counts = {};

for (const { dataset, file } of DATASETS) {
  const payload = readJson(path.join("distributions", file));
  if (payload.dataset !== dataset) {
    throw new Error(`${file}: dataset フィールドが想定と異なります (${payload.dataset} !== ${dataset})`);
  }

  const isChampions = dataset === "champions";
  const generation = isChampions ? 0 : payload.generation;
  if (!isChampions && typeof generation !== "number") {
    throw new Error(`${file}: generation が数値ではありません (${JSON.stringify(payload.generation)})`);
  }

  // ファイル内id一意性の防御的検査
  const idSet = new Set();
  for (const entry of payload.entries) {
    if (idSet.has(entry.id)) {
      throw new Error(`${file}: id "${entry.id}" が重複しています`);
    }
    idSet.add(entry.id);
  }

  const converted = payload.entries.map((entry) => convertEntry(entry, generation, isChampions));
  records.push(...converted);
  counts[dataset] = converted.length;
}

const buildDir = path.join(root, "build");
fs.mkdirSync(buildDir, { recursive: true });

const pokemonPath = path.join(buildDir, "pokemon.json");
const metaPath = path.join(buildDir, "meta.json");

// ---- generation別集計（byGeneration） ----
const byGeneration = {};
for (const r of records) {
  const key = String(r.generation);
  byGeneration[key] = (byGeneration[key] ?? 0) + 1;
}

counts.total = records.length;

// ---- 件数単調増加ガード（sync-dist-data.mjs 思想） ----
// 既存 build/meta.json より total が減る生成は、正本が縮んだ/壊れた事故の可能性が高い。
// 既定で拒否し、既存 build/ を保持したまま exit 1（意図的な削減のみ ALLOW_BUILD_SHRINK=1）。
if (fs.existsSync(metaPath)) {
  let prevTotal = 0;
  try {
    prevTotal = JSON.parse(fs.readFileSync(metaPath, "utf8"))?.counts?.total ?? 0;
  } catch {
    prevTotal = 0;
  }
  if (counts.total < prevTotal && process.env.ALLOW_BUILD_SHRINK !== "1") {
    console.error(
      `❌ ビルド中止: 生成件数 ${counts.total} < 既存 build/meta.json の ${prevTotal}（件数が減少）。\n` +
        `   正本 distributions/*.json が縮んでいないか確認してください。\n` +
        `   意図的な削減なら ALLOW_BUILD_SHRINK=1 を付けて再実行。既存 build/ は保持しました。`
    );
    process.exit(1);
  }
}

const meta = {
  schemaVersion: 1,
  source: "distributions/*.json",
  counts,
  byGeneration,
};

fs.writeFileSync(pokemonPath, JSON.stringify(records, null, 2) + "\n", "utf8");
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

console.log("build-distributions: 完了");
console.log(`  ${path.relative(root, pokemonPath)}: ${records.length}件`);
for (const { dataset } of DATASETS) {
  console.log(`    ${dataset}: ${counts[dataset]}件`);
}
console.log(`  byGeneration: ${JSON.stringify(byGeneration)}`);
console.log(`  ${path.relative(root, metaPath)} を出力しました`);

if (specialMovesFound.length > 0) {
  console.log(`\n[想定外] specialMoves が正本entryに存在します（${specialMovesFound.length}件・出力からはドロップ）:`);
  for (const s of specialMovesFound) {
    console.log(`  - id=${s.id}: ${JSON.stringify(s.value)}`);
  }
}
