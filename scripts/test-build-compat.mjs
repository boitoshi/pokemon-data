// 配信ポケモン正本 P3b: build/pokemon.json の受入テスト（app互換無損失検証）
//
// build/pokemon.json（正本から前方向生成・688件）が、現行コミット済み
// ../pokemon-distribution-app/public/pokemon.json（674件）に対して
// 「文書化済み正規化差分のみ」で無損失に前方向生成できているかを機械検証する。
//
// 未登録（＝説明できない）差分が1件でもあれば FAIL（exit 1）。これがこのテストの存在意義。
//
// CI-safe: sibling repo が無い環境（ENOENT）では skip 扱いで exit 0。
//
// 実行: node scripts/test-build-compat.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const BUILD_PATH = path.join(root, "build", "pokemon.json");
const APP_PATH = path.join(root, "..", "pokemon-distribution-app", "public", "pokemon.json");

// ---- allowlist マップ群（migrate-from-app.mjs / migrate-gen5-7.mjs の正本からコピー） ----

// FIX_MAP(ability, nature, distributionMethod) — migrate-from-app.mjs 正本 ＋
// migrate-gen5-7.mjs 由来（distributionMethodの "Poké Ball Plus" 救済。対象07138はgen5-7経由データ
// だが app committed pokemon.json 側にも同一idで存在するため、こちらのFIX_MAPも合成が必要）。
const FIX_MAP = {
  ability: {
    "ＡＲシステム": "ARシステム",
  },
  nature: {
    すなお: "すなおな",
  },
  distributionMethod: {
    配信会場: "配布会場",
    "Poké Ball Plus": "モンスターボール Plus",
  },
};

// REGION_FIX_MAP — migrate-from-app.mjs 正本
const REGION_FIX_MAP = {
  米国: "アメリカ",
};

// RIBBON_FIX_MAP — migrate-from-app.mjs 正本
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

// POKEMON_NAME_FIX_MAP — migrate-from-app.mjs 正本
const POKEMON_NAME_FIX_MAP = {
  ポリゴンZ: "ポリゴンＺ",
  ポリゴン2: "ポリゴン２",
};

// forward GAME_MAP — migrate-gen5-7.mjs の GAME_MAP と migrate-from-app.mjs の GAME_MAP を合成。
// トークン文字列 → games/titles.json の id 配列。
const GAME_MAP_GEN5_7 = {
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
const GAME_MAP_FROM_APP = {
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
const FORWARD_GAME_MAP = { ...GAME_MAP_GEN5_7 };
for (const [token, id] of Object.entries(GAME_MAP_FROM_APP)) {
  FORWARD_GAME_MAP[token] = [id];
}
// champions固有: migrate-champions.mjs がハードコードしている唯一のgame値
FORWARD_GAME_MAP["Pokémon Champions"] = ["pokemon_champions"];

// ---- ユーティリティ ----

function isEmptyRaw(v) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function normalize(v) {
  return isEmptyRaw(v) ? undefined : v;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function setEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function gameToIdSet(raw) {
  const tokens = raw
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const ids = new Set();
  for (const token of tokens) {
    const mapped = FORWARD_GAME_MAP[token];
    if (!mapped) return null; // 未知トークン
    for (const id of mapped) ids.add(id);
  }
  return ids;
}

function convertParens(s) {
  return s.replace(/\(/g, "（").replace(/\)/g, "）");
}

function applyPokemonNameFix(s) {
  for (const [from, to] of Object.entries(POKEMON_NAME_FIX_MAP)) {
    if (s === from) return to;
    if (s.startsWith(from + "（")) return to + s.slice(from.length);
  }
  return s;
}

function applyName(raw) {
  return applyPokemonNameFix(convertParens(raw));
}

// ---- field-level allowlist 判定 ----

function fieldAllowed(field, appNorm, buildNorm, isChampion) {
  switch (field) {
    case "ability":
    case "nature":
    case "distributionMethod": {
      const map = FIX_MAP[field];
      return typeof appNorm === "string" && Object.prototype.hasOwnProperty.call(map, appNorm) && map[appNorm] === buildNorm;
    }
    case "region": {
      if (typeof appNorm !== "string") return false;
      const fixed = appNorm
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "")
        .map((s) => REGION_FIX_MAP[s] ?? s)
        .join(",");
      return fixed === buildNorm;
    }
    case "pokemonName":
      return typeof appNorm === "string" && applyName(appNorm) === buildNorm;
    case "shiny":
      return appNorm === "色違い" && buildNorm === "あり";
    case "ribbons": {
      if (!Array.isArray(appNorm)) return false;
      const transformed = appNorm.filter((r) => r !== "Unknown").map((r) => RIBBON_FIX_MAP[r] ?? r);
      const transformedNorm = transformed.length > 0 ? transformed : undefined;
      return deepEqual(transformedNorm, buildNorm);
    }
    case "game": {
      if (typeof appNorm !== "string" || typeof buildNorm !== "string") return false;
      const appIds = gameToIdSet(appNorm);
      const buildIds = gameToIdSet(buildNorm);
      if (!appIds || !buildIds) return false;
      return setEqual(appIds, buildIds);
    }
    case "ivs":
      return appNorm === undefined && buildNorm !== undefined;
    case "specialMoves":
      return appNorm !== undefined && buildNorm === undefined;
    case "trainerId":
      return appNorm === "(プレイヤーのもの)" && buildNorm === undefined;
    case "metLocation":
      return appNorm === "-" && buildNorm === undefined;
    case "notes": {
      if (typeof appNorm !== "string" || typeof buildNorm !== "string") return false;
      if (buildNorm.startsWith(appNorm)) return true; // 正本側enrich（追記）
      // champions(gen0)のnotesは正本側で手動編集運用（冗長な自動生成文の削除・言い回し統一を含む）。
      // 一方向prefixに収まらない書き換えも「文書化された編集差分」として許容する。
      return isChampion === true;
    }
    default:
      return false;
  }
}

// ---- メイン ----

let buildRecords;
try {
  buildRecords = JSON.parse(fs.readFileSync(BUILD_PATH, "utf8"));
} catch (err) {
  if (err.code === "ENOENT") {
    console.log("test-build-compat: build/pokemon.json が見つかりません。先に `node scripts/build-distributions.mjs` を実行してください。");
    process.exit(1);
  }
  throw err;
}

let appRecords;
try {
  appRecords = JSON.parse(fs.readFileSync(APP_PATH, "utf8"));
} catch (err) {
  if (err.code === "ENOENT") {
    console.log("test-build-compat: skipped（siblings不在: ../pokemon-distribution-app が見つかりません）");
    process.exit(0);
  }
  throw err;
}

const buildById = new Map(buildRecords.map((r) => [r.managementId, r]));
const appById = new Map(appRecords.map((r) => [r.managementId, r]));

const commonIds = [...appById.keys()].filter((id) => buildById.has(id));
const buildOnlyIds = [...buildById.keys()].filter((id) => !appById.has(id));
const appOnlyIds = [...appById.keys()].filter((id) => !buildById.has(id));

// レコード単位のidentical/差分あり集計は、gen5-9（非champions）のみを母集団とする。
// champions(generation===0)は正本側で継続的に手動enrich運用されており、app側スナップショットとの
// 差分が常態化しているため、record-level統計からは除外する（build追加14件と同じ「champions別扱い」）。
// フィールド別バケット集計・unexplained検出は、champions分も含めた共通id全件に対して行う
// （champions由来のtrainerId/metLocation/notes等の差分パターンも文書化対象として可視化するため）。
let identicalCount = 0;
let diffCount = 0;
let championCommonDiffCount = 0;
const buckets = {};
const unexplained = [];
const commonChampionIds = [];

for (const id of commonIds) {
  const appRec = appById.get(id);
  const buildRec = buildById.get(id);
  const isChampion = appRec.generation === 0;
  if (isChampion) commonChampionIds.push(id);

  const keys = new Set([...Object.keys(appRec), ...Object.keys(buildRec)]);
  keys.delete("managementId");

  let recordHasDiff = false;

  for (const field of keys) {
    const appNorm = normalize(appRec[field]);
    const buildNorm = normalize(buildRec[field]);

    if (deepEqual(appNorm, buildNorm)) continue; // 差分なし

    recordHasDiff = true;

    if (fieldAllowed(field, appNorm, buildNorm, isChampion)) {
      buckets[field] = (buckets[field] ?? 0) + 1;
    } else {
      unexplained.push({ id, field, appValue: appNorm, buildValue: buildNorm });
    }
  }

  if (isChampion) {
    if (recordHasDiff) championCommonDiffCount++;
    continue; // record-level identical/diff統計には含めない
  }

  if (recordHasDiff) {
    diffCount++;
  } else {
    identicalCount++;
  }
}

// build-only（app未収載）: 全件 generation===0 であることを assert
const nonChampionAdditions = buildOnlyIds.filter((id) => buildById.get(id).generation !== 0);

// ---- レポート出力 ----

console.log("=== test-build-compat: build/pokemon.json vs distribution-app committed pokemon.json ===");
console.log("");
console.log(`build総件数: ${buildRecords.length} / app総件数: ${appRecords.length}`);
console.log(`共通件数（gen5-9、record-level統計の母集団）: ${commonIds.length - commonChampionIds.length}`);
console.log(`  identical: ${identicalCount}`);
console.log(`  差分あり: ${diffCount}`);
console.log(
  `共通だがchampions(generation===0)のためrecord-level統計から除外: ${commonChampionIds.length} (うち差分あり ${championCommonDiffCount}件, ids: ${commonChampionIds.join(", ")})`
);
console.log("");
console.log("フィールド別 許容差分バケット件数（champions分含む共通id全件が対象）:");
const bucketFields = Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a]);
if (bucketFields.length === 0) {
  console.log("  (なし)");
} else {
  for (const field of bucketFields) {
    console.log(`  ${field}: ${buckets[field]}`);
  }
}
console.log("");
console.log(`build追加件数（app未収載）: ${buildOnlyIds.length}`);
if (buildOnlyIds.length > 0) {
  console.log(`  ids: ${buildOnlyIds.join(", ")}`);
}
console.log(`app欠落件数（build未生成・データロス）: ${appOnlyIds.length}`);
if (appOnlyIds.length > 0) {
  console.log(`  ids: ${appOnlyIds.join(", ")}`);
}
console.log("");

if (nonChampionAdditions.length > 0) {
  console.log(`[異常] build追加のうちgeneration!==0のレコードが${nonChampionAdditions.length}件あります:`);
  for (const id of nonChampionAdditions) {
    console.log(`  - id=${id}: generation=${buildById.get(id).generation}`);
  }
  console.log("");
}

if (unexplained.length > 0) {
  console.log(`unexplained差分（未登録・要調査）: ${unexplained.length}件`);
  for (const u of unexplained) {
    console.log(`  - id=${u.id} field=${u.field} app=${JSON.stringify(u.appValue)} build=${JSON.stringify(u.buildValue)}`);
  }
  console.log("");
} else {
  console.log("unexplained差分: 0件");
  console.log("");
}

const ok = unexplained.length === 0 && appOnlyIds.length === 0 && nonChampionAdditions.length === 0;

console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
