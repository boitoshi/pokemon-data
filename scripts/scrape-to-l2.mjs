// 配信正本化 P5フォローアップ「scraper の L2 直接出力化」Phase A / Phase B (B2)。
//
// distribution-scraper が --json で吐くフラット行（scripts/json_writer.py、Converter.convert_all()
// の出力・49キー・全値str）を読み、L2 疎ネストentry配列（distributions/schema.json 準拠）へ変換する。
//
// 写像ロジックは scripts/migrate-gen5-7.mjs の flat→L2 変換を汎用化して流用している（DRY）。
// migrate-gen5-7.mjs はアプリ由来ソース（pokebros-tools/.../pokemon-all.json、gen5-7専用）が前提で、
//   - 値なしフィールドはキー自体が欠損する（app形式）
//   - game は既にJA名の配列
//   - gigantamax/alpha の truthy値は "あり" 固定
// という形状を仮定していた。distribution-scraper のJSONは
//   - 全49キーが常在し、値なしは "" （空文字列）で表現される
//   - game はカンマ結合されたJA名の文字列（例: "スカーレット, バイオレット"）
//   - gigantamax/alpha の truthy値は "キョダイマックス"/"オヤブン" 固有の文言
//   - moves/ribbons もカンマ結合文字列
// という違いがあるため、各関数を汎用化した点をコメントで明示している（検索: "汎用化ポイント"）。
//
// Phase A のスコープ: shape変換のみ。id採番・upsert・provenance付与・
// distributions/*.jsonへの書き込みは一切行わなかった。
// id は scraper の managementId をそのまま暫定値として carry する（B2 では捨て値。下記参照）。
//
// Phase B (B2) のスコープ: provenance-aware upsert。
//   - scraped entries を anchor.mjs の anchorKey で distributions/genN.json の既存entryとグループ化し、
//     MATCHED（anchor一致）は書かない、NEW（anchor不一致）は near-dup ガードを通した上でのみ
//     append-only で新規id採番・追加する。
//   - scraped の id（managementId）は matching にも採番にも使わない捨て値（前段Phase Aの暫定値）。
//   - 既存entriesは as-parsed のまま保持（byte往復同一）。書き込みは新規追加が1件以上あるときだけ。
//
// 実行: node scripts/scrape-to-l2.mjs <flat.json> [--dry-run] [--dist-dir <dir>] [--report <path>]
// （distribution-scraper 側は `uv run python -m scripts.main --gen 9 --json <flat.json>` で生成）
// 旧 Phase A の第2引数 out.json（staging出力）は廃止。

import fs from "node:fs";
import path from "node:path";
import { anchorKey, buildAnchorIndex } from "./anchor.mjs";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

// ---- CLI引数パース ----
// 位置引数は <flat.json> のみ。--dist-dir/--report はオプション値を伴うフラグ。
function parseArgs(argv) {
  let flatPathArg = null;
  let dryRun = false;
  let distDirArg = "distributions";
  let reportPathArg = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--dist-dir") {
      distDirArg = argv[++i];
      if (distDirArg === undefined) throw new Error("--dist-dir には値が必要です");
    } else if (a === "--report") {
      reportPathArg = argv[++i];
      if (reportPathArg === undefined) throw new Error("--report には値が必要です");
    } else if (flatPathArg === null) {
      flatPathArg = a;
    } else {
      throw new Error(`未知の引数: "${a}"`);
    }
  }
  return { flatPathArg, dryRun, distDirArg, reportPathArg };
}

const { flatPathArg, dryRun, distDirArg, reportPathArg } = parseArgs(process.argv.slice(2));
if (!flatPathArg) {
  console.error("使い方: node scripts/scrape-to-l2.mjs <flat.json> [--dry-run] [--dist-dir <dir>] [--report <path>]");
  process.exit(1);
}

// ---- マスターデータ読み込み（distributions/ は読まない） ----
const pokemon = readJson("pokemon/all.json");
const titles = readJson("games/titles.json");
const abilities = readJson("abilities/all.json");
const natures = readJson("mappings/natures.json");
const ribbonsMap = readJson("mappings/ribbons.json");
const regionsMap = readJson("mappings/regions.json");
const methodsMap = readJson("mappings/distribution-methods.json");
const ballsMap = readJson("mappings/balls.json");
const schema = readJson("distributions/schema.json");

const titleIds = new Set(titles.map((t) => t.id));
const entryPropertyNames = new Set(Object.keys(schema.$defs.entry.properties));
const IV_KEYS = new Set(["hp", "atk", "def", "spa", "spd", "spe"]);

const abilityNames = new Set(abilities.map((a) => a.name_ja));
const natureNames = new Set(natures.map((n) => n.name_ja));
const ribbonValues = new Set([
  ...Object.values(ribbonsMap.ribbons ?? ribbonsMap),
  ...Object.values(ribbonsMap.marks ?? {}),
]);
const regionValues = new Set(Object.values(regionsMap));
const methodValues = new Set(Object.values(methodsMap));
const ballValues = new Set(Object.values(ballsMap));
const NATURE_SENTINEL_VALUES = new Set(["ランダム"]);
const ABILITY_SENTINEL_VALUES = new Set(["ランダム"]);

// ---- game 変換マップ（distribution-scraper Converter.game() が返すJA表示名 → titleId配列） ----
// distribution-scraper/mappings/games.json は pokemon-data/mappings/games.json のシンボリックリンクで、
// その "games" 辞書（コード→JA表示名、2026-07-24時点で44種の原子的JA名）を手動で対応付けたもの。
// migrate-gen5-7.mjs の GAME_MAP はコード単位（gen5-7専用）だったが、コード自体はgen依存で曖昧
// （例: "s" はgen9では「スカーレット」、gen7では「サン」を指す）なため、
// Converter.game() が gen_overrides 適用後に返す確定JA名を鍵にしている。
const GAME_MAP = {
  赤: ["red"],
  緑: ["green"],
  青: ["blue"],
  ピカチュウ: ["yellow"],
  金: ["gold"],
  銀: ["silver"],
  クリスタル: ["crystal"],
  ルビー: ["ruby"],
  サファイア: ["sapphire"],
  エメラルド: ["emerald"],
  コロシアム: ["colosseum"],
  ファイアレッド: ["firered"],
  リーフグリーン: ["leafgreen"],
  XD: ["xd"],
  ダイヤモンド: ["diamond"],
  パール: ["pearl"],
  プラチナ: ["platinum"],
  ハートゴールド: ["heartgold"],
  ソウルシルバー: ["soulsilver"],
  ブラック: ["black"],
  ホワイト: ["white"],
  ブラック2: ["black2"],
  ホワイト2: ["white2"],
  X: ["x"],
  Y: ["y"],
  オメガルビー: ["omegaruby"],
  アルファサファイア: ["alphasapphire"],
  サン: ["sun"],
  ムーン: ["moon"],
  ウルトラサン: ["ultra_sun"],
  ウルトラムーン: ["ultra_moon"],
  "ピカチュウ（Let's Go）": ["lets_go_pikachu"],
  "イーブイ（Let's Go）": ["lets_go_eevee"],
  ピカブイ: ["lets_go_pikachu", "lets_go_eevee"],
  ソード: ["sword"],
  シールド: ["shield"],
  ブリリアントダイヤモンド: ["brilliant_diamond"],
  シャイニングパール: ["shining_pearl"],
  "Pokémon LEGENDS アルセウス": ["legends_arceus"],
  スカーレット: ["scarlet"],
  バイオレット: ["violet"],
  "Pokémon LEGENDS Z-A": ["legends_za"],
  // DLCは既存 distributions/gen9.json（id=09104）の先例に倣い本体タイトルへ畳む
  "M次元ラッシュ（ZA DLC）": ["legends_za"],
  ぽこポケ: ["poco_a_pokemon"],
};

// 起動時に一度、マップの全ターゲットIDが titles.json に存在することを検証する（migrate-gen5-7.mjs と同様）
const allMappedIds = new Set(Object.values(GAME_MAP).flat());
for (const id of allMappedIds) {
  if (!titleIds.has(id)) {
    throw new Error(`GAME_MAP のターゲットID "${id}" が games/titles.json に存在しません`);
  }
}

function convertGames(rawGameField, managementId) {
  const atomics = (rawGameField ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const result = [];
  for (const atomic of atomics) {
    const mapped = GAME_MAP[atomic];
    if (!mapped) {
      throw new Error(`未知の game 値 "${atomic}"（元: "${rawGameField}"） (managementId=${managementId})`);
    }
    for (const id of mapped) {
      if (!result.includes(id)) result.push(id);
    }
  }
  if (result.length === 0) {
    throw new Error(`games が空です (managementId=${managementId})`);
  }
  return result;
}

// ---- migrate-gen5-7.mjs から移植（形状不変のためそのまま） ----

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

function convertPokemonName(rawName) {
  const m = rawName.match(FORM_RE);
  if (m) {
    return { pokemonName: m[1], form: m[2] };
  }
  return { pokemonName: rawName };
}

// FIX_MAP: migrate-gen5-7.mjs からそのまま移植（表記ゆれ訂正・正典表記への統一。Fable5レビュー由来）
const FIX_MAP = {
  ability: {
    "ＡＲシステム": "ARシステム",
  },
  distributionMethod: {
    "Poké Ball Plus": "モンスターボール Plus",
  },
  ribbon: {
    おもいでリボン: "メモリアルリボン",
    チャンピオンリボン: "バトルチャンプリボン",
  },
};

function applyFixMap(field, value) {
  const map = FIX_MAP[field];
  if (map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  return value;
}

// ---- 汎用化ポイント: distribution-scraper 由来のJSON形状に合わせて新規追加・調整した部分 ----

// 汎用化ポイント1: scraper JSON は ivs_* キーが全常在で、値なしは "" （空文字列）で表現される
// （migrate-gen5-7 の想定ソースはキー自体が欠損しうる app 形式だった）。"" を「値なし」として扱う。
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
  const hasAny = ivKeys.some((k) => {
    const v = entry[sourceKeys[k]];
    return v !== null && v !== undefined && v !== "";
  });
  if (hasAny) {
    const ivs = {};
    for (const k of ivKeys) {
      const v = entry[sourceKeys[k]];
      if (v !== null && v !== undefined && v !== "") {
        const num = Number(v);
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

// 汎用化ポイント2: migrate-gen5-7 のtruthy値は app 形式の "あり" 固定だったが、scraper は
// Converter._convert_gigantamax/_convert_alpha が固有の日本語文言（"キョダイマックス"/"オヤブン"）を
// 返すため、フィールドごとに許容truthy値を拡張した（ホワイトリスト方式は維持＝Fable5ハードニング踏襲）。
const FLAG_FALSY_VALUES = new Set(["", "なし", "無", "×"]);
const FLAG_TRUTHY_VALUES_BY_FIELD = {
  gigantamax: new Set(["あり", "キョダイマックス"]),
  alpha: new Set(["あり", "オヤブン"]),
};

function convertFlag(rawValue, fieldName, managementId) {
  if (FLAG_FALSY_VALUES.has(rawValue)) return undefined;
  const truthySet = FLAG_TRUTHY_VALUES_BY_FIELD[fieldName] ?? new Set(["あり"]);
  if (truthySet.has(rawValue)) return true;
  throw new Error(`未知の ${fieldName} 値 "${rawValue}" (managementId=${managementId})`);
}

// 汎用化ポイント3: splitCommaList — scraper の moves/ribbons/specialMoves はカンマ結合文字列
// （", " 区切り、Converter.convert_event() 由来）なので配列化する。migrate-gen5-7 のソースは
// 既に配列だったため、この分割ヘルパーは本スクリプトでの新規追加。
function splitCommaList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function convertEntry(entry) {
  const out = {};

  // id は scraper の managementId をそのまま暫定値として carry する。
  // provisional: Phase B が anchor 一致（dexNo, startDate, games, distributionMethod 等）による
  // 凍結idに置換するまでの仮値であり、upsert 時に安定した識別子としては使えない。
  out.id = entry.managementId;

  out.dexNo = Number(entry.dexNo);
  if (!Number.isInteger(out.dexNo) || out.dexNo < 1) {
    throw new Error(`dexNo "${entry.dexNo}" が正の整数に変換できません (managementId=${entry.managementId})`);
  }

  Object.assign(out, convertPokemonName(entry.pokemonName));

  out.games = convertGames(entry.game, entry.managementId);

  out.eventName = entry.eventName;

  if (entry.distributionMethod === "") {
    throw new Error(`distributionMethod が空です (managementId=${entry.managementId})`);
  }
  out.distributionMethod = applyFixMap("distributionMethod", entry.distributionMethod);
  if (entry.distributionLocation !== "") out.distributionLocation = entry.distributionLocation;

  if (entry.startDate === "") {
    throw new Error(`startDate が空です (managementId=${entry.managementId})`);
  }
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

  const moves = splitCommaList(entry.moves);
  if (moves.length > 0) out.moves = moves;
  const specialMoves = splitCommaList(entry.specialMoves);
  if (specialMoves.length > 0) out.specialMoves = specialMoves;
  const ribbons = splitCommaList(entry.ribbons);
  if (ribbons.length > 0) out.ribbons = ribbons.map((r) => applyFixMap("ribbon", r));

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

// ==================================================================
// 検証: distributions/schema.json 準拠チェック
// validate-distributions.mjs の entry 検査ロジックを、実 distributions/ ではなく
// staging 済みの entries 配列（メモリ上）に対して適用する（読み取り専用・書き込みなし）。
// ハード違反は throw、値集合ドリフト（マスターデータとの表記ゆれ等）は warning として集計のみ。
// ==================================================================

function isRealDate(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateEntries(entries, dataset) {
  const warnings = [];
  const warn = (type, detail) => warnings.push({ type, detail });
  const idsSeen = new Set();

  for (const [index, entry] of entries.entries()) {
    const where = `${dataset}#${index} (id=${entry.id ?? "?"})`;

    for (const key of Object.keys(entry)) {
      if (!entryPropertyNames.has(key)) {
        throw new Error(`${where}: 未知のフィールド "${key}" があります（distributions/schema.json の entry.properties に未定義）`);
      }
    }

    for (const key of ["id", "dexNo", "pokemonName", "games", "eventName", "distributionMethod", "startDate"]) {
      if (!(key in entry)) {
        throw new Error(`${where}: 必須フィールド "${key}" がありません`);
      }
    }
    if (!Array.isArray(entry.games) || entry.games.length < 1) {
      throw new Error(`${where}: games は長さ1以上の配列である必要があります`);
    }

    for (const key of ["region", "ribbons", "moves", "specialMoves"]) {
      if (key in entry && !Array.isArray(entry[key])) {
        throw new Error(`${where}: "${key}" は配列である必要があります（実際の型: ${typeof entry[key]}）`);
      }
    }

    if ("ot" in entry && "otFromPlayer" in entry) {
      throw new Error(`${where}: ot と otFromPlayer は同時に存在できません`);
    }
    if ("otFromPlayer" in entry && entry.otFromPlayer !== true) {
      throw new Error(`${where}: otFromPlayer は true 以外許可されません (got: ${entry.otFromPlayer})`);
    }
    if ("trainerId" in entry && typeof entry.trainerId !== "string") {
      throw new Error(`${where}: trainerId は文字列である必要があります (got: ${typeof entry.trainerId})`);
    }
    if ("level" in entry && !(Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 100)) {
      throw new Error(`${where}: level は1..100の整数である必要があります (got: ${entry.level})`);
    }

    if ("ivs" in entry) {
      if (typeof entry.ivs !== "object" || entry.ivs === null || Array.isArray(entry.ivs)) {
        throw new Error(`${where}: ivs はオブジェクトである必要があります`);
      }
      for (const [k, v] of Object.entries(entry.ivs)) {
        if (!IV_KEYS.has(k)) {
          throw new Error(`${where}: ivs に未知のキー "${k}" があります（許可: hp/atk/def/spa/spd/spe）`);
        }
        if (!(Number.isInteger(v) && v >= 0 && v <= 31)) {
          throw new Error(`${where}: ivs.${k} は0..31の整数である必要があります (got: ${v})`);
        }
      }
    }
    if ("ivsGuaranteed" in entry && !(Number.isInteger(entry.ivsGuaranteed) && entry.ivsGuaranteed >= 0 && entry.ivsGuaranteed <= 6)) {
      throw new Error(`${where}: ivsGuaranteed は0..6の整数である必要があります (got: ${entry.ivsGuaranteed})`);
    }
    if ("ivs" in entry && "ivsGuaranteed" in entry) {
      throw new Error(`${where}: ivs と ivsGuaranteed は同時に存在できません`);
    }

    if (idsSeen.has(entry.id)) {
      throw new Error(`${where}: id "${entry.id}" が staging バッチ内で重複しています`);
    }
    idsSeen.add(entry.id);

    const master = pokemon[String(entry.dexNo)];
    if (!master) {
      throw new Error(`${where}: dexNo ${entry.dexNo} が pokemon/all.json に存在しません`);
    }
    if (entry.pokemonName !== master.name_ja) {
      throw new Error(`${where}: pokemonName "${entry.pokemonName}" が pokemon/all.json の name_ja "${master.name_ja}" と一致しません`);
    }

    for (const gameId of entry.games) {
      if (!titleIds.has(gameId)) {
        throw new Error(`${where}: games の "${gameId}" が games/titles.json の id に存在しません`);
      }
    }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(entry.startDate)) {
      throw new Error(`${where}: startDate "${entry.startDate}" が YYYY-MM-DD 形式ではありません`);
    }
    if (!isRealDate(entry.startDate)) {
      throw new Error(`${where}: startDate "${entry.startDate}" は実在しない日付です`);
    }
    if ("endDate" in entry) {
      if (!dateRe.test(entry.endDate)) {
        throw new Error(`${where}: endDate "${entry.endDate}" が YYYY-MM-DD 形式ではありません`);
      }
      if (!isRealDate(entry.endDate)) {
        throw new Error(`${where}: endDate "${entry.endDate}" は実在しない日付です`);
      }
      if (entry.startDate > entry.endDate) {
        throw new Error(`${where}: startDate "${entry.startDate}" が endDate "${entry.endDate}" より後です`);
      }
    }

    if ("shiny" in entry && entry.shiny !== "fixed" && entry.shiny !== "conditional") {
      throw new Error(`${where}: shiny "${entry.shiny}" は fixed|conditional のいずれかである必要があります`);
    }

    // ---- warning（集計のみ） ----
    if (Array.isArray(entry.region)) {
      for (const r of entry.region) {
        if (!regionValues.has(r)) warn("region-not-in-master", `${where}: region "${r}" が mappings/regions.json の値集合にありません`);
      }
    }
    if ("distributionMethod" in entry && !methodValues.has(entry.distributionMethod)) {
      warn("distributionMethod-not-in-master", `${where}: distributionMethod "${entry.distributionMethod}" が mappings/distribution-methods.json の値集合にありません`);
    }
    if ("ball" in entry && !ballValues.has(entry.ball)) {
      warn("ball-not-in-master", `${where}: ball "${entry.ball}" が mappings/balls.json の値集合にありません`);
    }
    if ("nature" in entry && !NATURE_SENTINEL_VALUES.has(entry.nature) && !natureNames.has(entry.nature)) {
      warn("nature-not-in-master", `${where}: nature "${entry.nature}" が mappings/natures.json の name_ja にありません`);
    }
    if (Array.isArray(entry.ribbons)) {
      for (const r of entry.ribbons) {
        if (!ribbonValues.has(r)) warn("ribbon-not-in-master", `${where}: ribbon "${r}" が mappings/ribbons.json の値集合にありません`);
      }
    }
    if ("ability" in entry && !ABILITY_SENTINEL_VALUES.has(entry.ability) && !abilityNames.has(entry.ability)) {
      warn("ability-not-in-master", `${where}: ability "${entry.ability}" が abilities/all.json の name_ja にありません`);
    }
  }

  return { warnings };
}

// ==================================================================
// Phase B (B2): provenance-aware upsert のための補助関数
// ==================================================================

// 世代→idプレフィックス（validate-distributions.mjs の GEN_PREFIX を参照元とし、
// このスクリプトが対象とする gen1〜gen9 分のみをここに複製する。champions はB2の対象外）。
const GEN_PREFIX = {
  gen1: "01",
  gen2: "02",
  gen3: "03",
  gen4: "04",
  gen5: "05",
  gen6: "06",
  gen7: "07",
  gen8: "08",
  gen9: "09",
};

// "YYYY-MM-DD" 文字列同士の日数差（絶対値）。validate-distributions.mjs の isRealDate と同様、
// UTC固定の Date.UTC で計算する（タイムゾーン依存の揺れを避ける）。
function dateDiffDays(dateA, dateB) {
  const parse = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(parse(dateA) - parse(dateB)) / 86400000;
}

// near-dup ガード: scraped S に対する既存 E が「同一配信の可能性が高い」かどうか。
// auto-add の安全化が目的（relaxed監査を置換）。form は意図的に match条件へ含めない
// （フォルム表記の粒度差だけで別配信と誤判定しないため。相違は diffFields 側で報告する）。
function isNearDup(existing, scraped) {
  if (existing.dexNo !== scraped.dexNo) return false;
  if ("endDate" in existing && "endDate" in scraped && existing.endDate === scraped.endDate) return true;
  return dateDiffDays(existing.startDate, scraped.startDate) <= 7;
}

// diffFields: 両側の値を比較して conflict / info に分類する。
// conflict候補（両側presentで値相違＝要確認）と info候補（scraper側が弱い/欠落＝削除ではない）で
// 対象フィールドを分けている（後者はconflict扱いしない）。
const CONFLICT_FIELDS = [
  "games",
  "level",
  "shiny",
  "ability",
  "nature",
  "ball",
  "teraType",
  "gigantamax",
  "alpha",
  "ivsGuaranteed",
  "moves",
];
const INFO_FIELDS = ["eventName", "region", "form", "metLocation"];
const ARRAY_COMPARE_FIELDS = new Set(["games", "moves", "region"]);

function normalizeForCompare(field, value) {
  if (value === undefined) return undefined;
  if (ARRAY_COMPARE_FIELDS.has(field)) {
    return JSON.stringify(Array.isArray(value) ? [...value].sort() : value);
  }
  return value;
}

function fieldsDiffer(field, a, b) {
  return normalizeForCompare(field, a) !== normalizeForCompare(field, b);
}

function diffFields(scraped, existing) {
  const conflicts = [];
  for (const field of CONFLICT_FIELDS) {
    if (field in scraped && field in existing && fieldsDiffer(field, scraped[field], existing[field])) {
      conflicts.push({ field, ledger: existing[field], scraper: scraped[field] });
    }
  }
  const info = [];
  for (const field of INFO_FIELDS) {
    if ((field in scraped || field in existing) && fieldsDiffer(field, scraped[field], existing[field])) {
      info.push({ field, ledger: existing[field], scraper: scraped[field] });
    }
  }
  return { conflicts, info };
}

function describeAnchor(entry) {
  const games = Array.isArray(entry.games) ? entry.games.join("+") : "";
  return `dexNo=${entry.dexNo} startDate=${entry.startDate} games=${games} method=${entry.distributionMethod}`;
}

function labelEntry(entry) {
  return entry.form ? `${entry.pokemonName}（${entry.form}）` : entry.pokemonName;
}

function formatVal(v) {
  if (v === undefined) return "(欠落)";
  if (Array.isArray(v)) return v.join("+");
  return String(v);
}

function formatDiffParts(diffs) {
  return diffs.map((d) => `${d.field} 台帳=${formatVal(d.ledger)} scraper=${formatVal(d.scraper)}`);
}

// ==================================================================
// メイン処理（Phase B: provenance-aware upsert）
// ==================================================================

const flatRows = JSON.parse(fs.readFileSync(path.resolve(flatPathArg), "utf8"));
if (!Array.isArray(flatRows)) {
  throw new Error(`入力が配列ではありません: ${flatPathArg}`);
}
if (flatRows.length === 0) {
  throw new Error(`入力が空です: ${flatPathArg}`);
}

const generations = new Set(flatRows.map((r) => r.generation));
if (generations.size !== 1) {
  throw new Error(`入力内で generation が揃っていません: ${[...generations].join(", ")}`);
}
const generationRaw = [...generations][0];
const generation = Number(generationRaw);
if (!Number.isInteger(generation)) {
  throw new Error(`generation "${generationRaw}" が整数に変換できません`);
}
const dataset = `gen${generation}`;

// finding7: 封筒 dataset は gen1〜gen9 のみ対象（範囲外はthrow。champions等は非対応）
if (!/^gen[1-9]$/.test(dataset)) {
  throw new Error(`dataset "${dataset}" が対象範囲外です（scrape-to-l2.mjs は gen1〜gen9 のみ対応。finding7: 封筒検査）`);
}

const scrapedEntries = flatRows.map((row) => convertEntry(row));
const { warnings } = validateEntries(scrapedEntries, dataset);

console.log("=== scrape-to-l2: 変換 ===");
console.log(`  dataset: ${dataset} / generation: ${generation} / scraped: ${scrapedEntries.length}件`);
if (warnings.length === 0) {
  console.log("  schema警告: なし");
} else {
  const byType = new Map();
  for (const w of warnings) {
    if (!byType.has(w.type)) byType.set(w.type, []);
    byType.get(w.type).push(w.detail);
  }
  console.log("  schema警告:");
  for (const [type, details] of byType.entries()) {
    console.log(`    ${type}: ${details.length}件`);
  }
}

// ---- target 解決 ----
const distDir = path.resolve(root, distDirArg);
const targetFileName = `${dataset}.json`;
const targetPath = path.join(distDir, targetFileName);
if (!fs.existsSync(targetPath)) {
  throw new Error(`target が存在しません: ${targetPath}（新規ファイル作成はB2の対象外）`);
}
const existingRaw = fs.readFileSync(targetPath, "utf8");
const existingPayload = JSON.parse(existingRaw);
const existingEntries = existingPayload.entries; // as-parsed のまま保持（再order/正規化しない＝byte往復同一のため）

// ---- anchor index（既存entries） ----
const anchorIndex = buildAnchorIndex(existingEntries);

// ---- scraped を anchorKey でグループ化（Map。scraped配列の初出順を保持＝id採番の決定性） ----
const scrapedGroups = new Map();
for (const m of scrapedEntries) {
  const key = anchorKey(m);
  if (!scrapedGroups.has(key)) scrapedGroups.set(key, []);
  scrapedGroups.get(key).push(m);
}

// ---- 分類 ----
const addCandidates = []; // ADD予定のscraped entry（idはこの後で採番。scraped初出順）
const buckets = {
  nearDup: [], // 要確認・既存に酷似
  multiVariant: [], // 新規・多バリアント
  protectedSkip: [], // 保護スキップ
  updateCandidate: [], // 更新候補(report-only)
};

for (const [key, members] of scrapedGroups.entries()) {
  const existingGroup = anchorIndex.get(key);

  if (existingGroup) {
    // MATCHED: 書かない
    const anyProtected = existingGroup.some((e) => !e.source || e.source.kind === "self" || e.source.kind === "official");
    const repScraped = members[0];
    const repExisting = existingGroup[0];
    const { conflicts, info } = diffFields(repScraped, repExisting);
    const item = {
      anchor: describeAnchor(repExisting),
      existingIds: existingGroup.map((e) => e.id),
      scrapedCount: members.length,
      // Fable finding5: 多対一マッチ（フラベベ5色等）は member を列挙し、将来の手動集約判断の材料を残す。
      members: members.length > 1 ? members.map((m) => ({ label: labelEntry(m), eventName: m.eventName })) : null,
      conflicts,
      info,
    };
    if (anyProtected) {
      buckets.protectedSkip.push(item);
    } else {
      buckets.updateCandidate.push(item);
    }
    continue;
  }

  // NEW: near-dup ガードを全メンバーに適用
  const withNearDup = [];
  const withoutNearDup = [];
  for (const m of members) {
    const nearDups = existingEntries.filter((e) => isNearDup(e, m));
    if (nearDups.length > 0) {
      withNearDup.push({ member: m, nearDups });
    } else {
      withoutNearDup.push(m);
    }
  }

  for (const { member, nearDups } of withNearDup) {
    const repNearDup = nearDups[0];
    const { conflicts, info } = diffFields(member, repNearDup);
    buckets.nearDup.push({
      scraped: labelEntry(member),
      eventName: member.eventName,
      existingIds: nearDups.map((e) => e.id),
      startDateDiff:
        member.startDate !== repNearDup.startDate
          ? { field: "startDate", ledger: repNearDup.startDate, scraper: member.startDate }
          : null,
      conflicts,
      info,
    });
  }

  if (withoutNearDup.length === 1) {
    addCandidates.push(withoutNearDup[0]);
  } else if (withoutNearDup.length > 1) {
    buckets.multiVariant.push({
      anchor: describeAnchor(withoutNearDup[0]),
      members: withoutNearDup.map((m) => ({ label: labelEntry(m), eventName: m.eventName })),
    });
  }
  // withoutNearDup.length === 0 → 全員near-dup。ADDなし。
}

// ---- バッチ内 near-dup ガード（Fable finding1） ----
// isNearDup は scraped×既存しか見ないため、同一バッチ内で「同dexNo・日付近接・別anchor・既存対応なし」の
// 2行が両方 auto-add されうる（Bulbapediaが同一配信を地域別行/日付訂正で複数行化した場合等）。
// クラスタを成す候補は全て自動追加せず「要確認・既存に酷似」へ降格する（安全側・約束4のバッチ内漏れ塞ぎ）。
const survivingAdds = [];
for (let i = 0; i < addCandidates.length; i++) {
  const cand = addCandidates[i];
  const siblings = addCandidates.filter((other, j) => j !== i && isNearDup(other, cand));
  if (siblings.length === 0) {
    survivingAdds.push(cand);
    continue;
  }
  const { conflicts, info } = diffFields(cand, siblings[0]);
  buckets.nearDup.push({
    scraped: labelEntry(cand),
    eventName: cand.eventName,
    existingIds: [],
    siblingLabels: siblings.map((s) => labelEntry(s)),
    startDateDiff:
      cand.startDate !== siblings[0].startDate
        ? { field: "startDate", ledger: siblings[0].startDate, scraper: cand.startDate }
        : null,
    conflicts,
    info,
  });
}

// ---- id採番（ADDのみ・append-only。scraped初出順） ----
const prefix = GEN_PREFIX[dataset];
if (!prefix) {
  throw new Error(`GEN_PREFIX に "${dataset}" が定義されていません`);
}
const prefixedIds = existingEntries.map((e) => String(e.id)).filter((id) => id.startsWith(prefix));
let suffixWidth = null;
let maxSuffix = 0;
if (prefixedIds.length > 0) {
  suffixWidth = prefixedIds[0].length - prefix.length;
  for (const id of prefixedIds) {
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > maxSuffix) maxSuffix = n;
  }
} else if (survivingAdds.length > 0) {
  throw new Error(`既存entriesに prefix "${prefix}" で始まる id がなく、桁数(suffixWidth)を決定できません`);
}

const additions = [];
let nextSuffix = maxSuffix + 1;
for (const member of survivingAdds) {
  if (nextSuffix >= 10 ** suffixWidth) {
    throw new Error(`id採番: suffixWidth=${suffixWidth}桁の上限に達しました（次値 ${nextSuffix}）。桁拡張が必要です`);
  }
  const newId = prefix + String(nextSuffix).padStart(suffixWidth, "0");
  nextSuffix += 1;
  additions.push(orderEntry({ ...member, id: newId, source: { kind: "bulbapedia" } }));
}

// ---- 書き込み（!dry-run && additions.length>0 のときだけ。既存entriesはbyte不変で末尾追加） ----
let writeStatus;
if (dryRun) {
  writeStatus = "dry-run";
} else if (additions.length === 0) {
  writeStatus = "skip";
} else {
  // Fable finding2: byte往復同一の前提（既存ファイルが正準JSON=2スペース+末尾改行）を write 前に検査する。
  // 不一致（手編集でのフォーマットずれ等）なら黙って全面正規化せず throw して中断する（保証を無条件化）。
  const canonicalExisting = JSON.stringify(existingPayload, null, 2) + "\n";
  if (existingRaw !== canonicalExisting) {
    throw new Error(
      `既存ファイルが正準JSON形式（2スペースインデント + 末尾改行）でないため安全に追記できません: ${targetPath}\n` +
        `  手編集等でフォーマットがずれています。正準化してから再実行してください（byte往復同一の保証が崩れるため中断）。`
    );
  }
  // Fable finding3: 封筒は spread で組み、既知5キー以外（将来の手編集キー）やキー順を保持する
  // （固定キー再構築だと未知キーが黙って脱落するため）。entries は既存位置のまま中身だけ差し替わる。
  const newPayload = { ...existingPayload, entries: [...existingEntries, ...additions] };
  // Fable finding6: temp+rename でアトミックに書く（中断時の部分書き込みを避ける）。
  const tmpPath = targetPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(newPayload, null, 2) + "\n", "utf8");
  fs.renameSync(tmpPath, targetPath);
  writeStatus = "applied";
}

// ---- レポート（stdout・日本語） ----
const mode = dryRun ? "dry-run" : "apply";
console.log(`\n=== upsert 計画（target: ${path.relative(root, targetPath)} / mode: ${mode}）===`);
console.log(`scraped:${scrapedEntries.length}件 / 既存:${existingEntries.length}件`);

// Fable finding4: 追加entryは英語eventName・かな metLocation 等の raw 値をそのまま持つため取り込み後の手レビュー前提。
const addCaveat = additions.length > 0 ? "（英語eventName・かな metLocation 等 raw 値のまま。取り込み後の手レビュー前提）" : "";
console.log(`\n[新規追加] ${additions.length}件${addCaveat}`);
for (const a of additions) {
  console.log(`  - ${a.id} dexNo=${a.dexNo} ${labelEntry(a)} ev="${a.eventName}"`);
}

console.log(`\n[要確認・既存に酷似] ${buckets.nearDup.length}件`);
for (const n of buckets.nearDup) {
  const diffParts = [];
  if (n.startDateDiff) {
    diffParts.push(`startDate 台帳=${n.startDateDiff.ledger} scraper=${n.startDateDiff.scraper}`);
  }
  diffParts.push(...formatDiffParts(n.conflicts));
  diffParts.push(...formatDiffParts(n.info));
  // 既存マッチは 既存[ids]、バッチ内 near-dup（finding1降格）は バッチ内候補[labels] を参照先に出す。
  const ref = n.existingIds.length > 0 ? `既存[${n.existingIds.join(",")}]` : `バッチ内候補[${(n.siblingLabels ?? []).join(", ")}]`;
  console.log(`  - scraped ${n.scraped} ev="${n.eventName}" ~ ${ref}：相違 ${diffParts.join(" / ")}`);
}

console.log(`\n[新規・多バリアント] ${buckets.multiVariant.length}グループ`);
for (const g of buckets.multiVariant) {
  console.log(`  - A=${g.anchor} scraped ${g.members.length}件`);
  for (const m of g.members) {
    console.log(`      ${m.label} ev="${m.eventName}"`);
  }
}

console.log(`\n[保護スキップ] ${buckets.protectedSkip.length}件`);
for (const p of buckets.protectedSkip) {
  const diffParts = [...formatDiffParts(p.conflicts), ...formatDiffParts(p.info)];
  const diffStr = diffParts.length > 0 ? `；${diffParts.join(" / ")}` : "";
  console.log(`  - A=${p.anchor} 既存[${p.existingIds.join(",")}] ⇔ scraped ${p.scrapedCount}件${diffStr}`);
  if (p.members) {
    // finding5: 多対一マッチの各バリアントを列挙（手動集約判断の材料）
    for (const m of p.members) console.log(`      ${m.label} ev="${m.eventName}"`);
  }
}

console.log(`\n[更新候補(report-only)] ${buckets.updateCandidate.length}件`);
for (const u of buckets.updateCandidate) {
  const diffParts = [...formatDiffParts(u.conflicts), ...formatDiffParts(u.info)];
  const diffStr = diffParts.length > 0 ? `；${diffParts.join(" / ")}` : "";
  console.log(`  - A=${u.anchor} 既存[${u.existingIds.join(",")}] ⇔ scraped ${u.scrapedCount}件${diffStr}`);
  if (u.members) {
    for (const m of u.members) console.log(`      ${m.label} ev="${m.eventName}"`);
  }
}

console.log(
  `\nサマリ: 追加${additions.length} / 酷似${buckets.nearDup.length} / 多バリアント${buckets.multiVariant.length} / 保護${buckets.protectedSkip.length} / 更新${buckets.updateCandidate.length}`
);

const writeStatusLabel =
  writeStatus === "applied" ? `実施(${targetFileName})` : writeStatus === "skip" ? "スキップ(追加0)" : "dry-run";
console.log(`書き込み: ${writeStatusLabel}`);

// ---- --report（機械可読・任意） ----
if (reportPathArg) {
  const reportPayload = {
    target: path.relative(root, targetPath),
    mode,
    scrapedCount: scrapedEntries.length,
    existingCount: existingEntries.length,
    summary: {
      added: additions.length,
      nearDup: buckets.nearDup.length,
      multiVariant: buckets.multiVariant.length,
      protectedSkip: buckets.protectedSkip.length,
      updateCandidate: buckets.updateCandidate.length,
    },
    added: additions.map((a) => ({
      id: a.id,
      dexNo: a.dexNo,
      pokemonName: a.pokemonName,
      form: a.form,
      eventName: a.eventName,
    })),
    nearDup: buckets.nearDup,
    multiVariant: buckets.multiVariant,
    protectedSkip: buckets.protectedSkip,
    updateCandidate: buckets.updateCandidate,
    writeStatus,
  };
  const reportPath = path.resolve(reportPathArg);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2) + "\n", "utf8");
  console.log(`\nレポート出力: ${reportPath}`);
}

console.log("\nscrape-to-l2: 完了");
