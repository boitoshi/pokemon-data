// リボン・あかしカタログ正本の検証
//
// ribbons/catalog.json を games/titles.json・services/all.json・mappings/ribbons.json と
// 突き合わせて検証する。エラーは1件目で止めず、全部集めてから一覧で出す。
//
// catalog
// - key ユニーク / route.id ユニーク（カタログ全体で）
// - kind が ribbon | mark
// - route.games の各 id が games/titles.json に存在する
// - route 直下のキーは決まったものだけ（availability 等を route 直下に書いたら止める）
// - route.timing（必須）が on_capture | post_capture
// - route.methods[]（任意）: games は route.games の部分集合・method 間で重複なし・和が route.games と一致。
//   availability（必須）の値、requiresServices が services/all.json に実在、
//   endDate / endTime は availability: "ended" のときだけ・書式、requirements / note は文字列
// - route.references（[{url,label}]）/ checkedAt（YYYY-MM-DD）/ verified（実機確認）の書式
// - route.excludedPorts（任意）: 移植版（portOf を持つ title）の id の配列
// - 移植版の網羅: portOf: X のタイトル P について、games に X を含む route はすべて、
//   games に P を含むか excludedPorts に P を持つ
// - mappings/ribbons.json との整合: mappings の各 (en, ja) が catalog に存在し name_ja が一致する
//   （catalog ⊇ mappings。逆方向は要求しない）
//
// services/all.json
// - id ユニーク、必須キー（id / name_ja / name_en / checkedAt）、endDate / endTime の書式、games の実在
//
// games/titles.json
// - portOf の先が実在し、自分自身・別の移植版を指さない
// - home.keepsRibbons は true | false | "unconfirmed"
//
// 実行: node scripts/validate-ribbons.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const catalog = readJson("ribbons/catalog.json");
const titles = readJson("games/titles.json");
const services = readJson("services/all.json");
const ribbonsMap = readJson("mappings/ribbons.json");

const VALID_KINDS = new Set(["ribbon", "mark"]);
const VALID_TIMINGS = new Set(["on_capture", "post_capture"]);
const VALID_AVAILABILITIES = new Set(["available", "distribution", "ended", "never", "unconfirmed"]);
const VALID_KEEPS_RIBBONS = new Set([true, false, "unconfirmed"]);
const VERIFIED_METHODS = new Set(["in-game", "official-image"]);
// route 直下に置けるキー。サービス依存・終了・未確認（availability / requiresServices / endDate）は
// methods[] にだけ書く（route 直下には置かない）ので、ここに無いキーは誤記として止める
const ROUTE_KEYS = new Set([
  "id", "generation", "games", "category", "description", "requirements", "eligibility",
  "timing", "methods", "references", "checkedAt", "verified", "excludedPorts",
]);
const METHOD_KEYS = new Set(["games", "availability", "requiresServices", "endDate", "endTime", "requirements", "note"]);
const SERVICE_KEYS = new Set(["id", "name_ja", "name_en", "games", "endDate", "endTime", "note", "references", "checkedAt"]);
const SERVICE_REQUIRED_KEYS = ["id", "name_ja", "name_en", "checkedAt"];

const errors = [];
const fail = (message) => errors.push(message);

const titleIds = new Set(titles.map((t) => t.id));
const titleById = new Map(titles.map((t) => [t.id, t]));

// ---- 書式ヘルパー ----

const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// YYYY-MM-DD かつ実在する日付
const isDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

// HH:MM（00:00〜23:59。JST の公式表記をそのまま入れる）
const isTime = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const checkReferences = (references, where) => {
  if (!Array.isArray(references) || references.length === 0) {
    fail(`${where}: references は [{ url, label }] の配列（1件以上）`);
    return;
  }
  references.forEach((ref, i) => {
    if (!isPlainObject(ref)) {
      fail(`${where}: references[${i}] はオブジェクト`);
      return;
    }
    if (typeof ref.url !== "string" || !/^https?:\/\//.test(ref.url)) {
      fail(`${where}: references[${i}].url は "https://…"`);
    }
    if (!isNonEmptyString(ref.label)) {
      fail(`${where}: references[${i}].label は空でない文字列`);
    }
    for (const key of Object.keys(ref)) {
      if (key !== "url" && key !== "label") fail(`${where}: references[${i}] に未知のキー: ${key}`);
    }
  });
};

const checkEndDateTime = (obj, where) => {
  if ("endDate" in obj && !isDate(obj.endDate)) {
    fail(`${where}: endDate は YYYY-MM-DD: ${JSON.stringify(obj.endDate)}`);
  }
  if ("endTime" in obj) {
    if (!isTime(obj.endTime)) fail(`${where}: endTime は HH:MM: ${JSON.stringify(obj.endTime)}`);
    if (!("endDate" in obj)) fail(`${where}: endTime だけあって endDate が無い`);
  }
};

const checkGameIds = (games, where) => {
  for (const game of games) {
    if (!titleIds.has(game)) fail(`${where} references unknown game: ${game}`);
  }
};

// ---- games/titles.json（移植版） ----

// portOf を持つタイトル（移植版）: id → 移植元 id
const ports = new Map();

for (const title of titles) {
  const where = `games/titles.json ${title.id}`;
  if ("portOf" in title) {
    const origin = title.portOf;
    if (!titleIds.has(origin)) {
      fail(`${where}: portOf の先が存在しない: ${origin}`);
    } else if (origin === title.id) {
      fail(`${where}: portOf が自分自身を指している`);
    } else if ("portOf" in titleById.get(origin)) {
      fail(`${where}: portOf の先 ${origin} も移植版（portOf を持つ）。元作品を指すこと`);
    } else {
      ports.set(title.id, origin);
    }
  }
  if (isPlainObject(title.home) && "keepsRibbons" in title.home && !VALID_KEEPS_RIBBONS.has(title.home.keepsRibbons)) {
    fail(`${where}: home.keepsRibbons は true / false / "unconfirmed": ${JSON.stringify(title.home.keepsRibbons)}`);
  }
}

// ---- services/all.json ----

const serviceIds = new Set();

if (!Array.isArray(services)) {
  fail("services/all.json はトップレベルが配列");
} else {
  services.forEach((service, i) => {
    if (!isPlainObject(service)) {
      fail(`services/all.json [${i}] はオブジェクト`);
      return;
    }
    const where = `services/all.json ${service.id ?? `[${i}]`}`;
    for (const key of SERVICE_REQUIRED_KEYS) {
      if (!isNonEmptyString(service[key])) fail(`${where}: 必須キー ${key} が無いか空`);
    }
    for (const key of Object.keys(service)) {
      if (!SERVICE_KEYS.has(key)) fail(`${where}: 未知のキー: ${key}`);
    }
    if (isNonEmptyString(service.id)) {
      if (serviceIds.has(service.id)) fail(`services/all.json has duplicate id: ${service.id}`);
      serviceIds.add(service.id);
    }
    if ("checkedAt" in service && !isDate(service.checkedAt)) {
      fail(`${where}: checkedAt は YYYY-MM-DD: ${JSON.stringify(service.checkedAt)}`);
    }
    checkEndDateTime(service, where);
    if ("games" in service) {
      if (!Array.isArray(service.games) || service.games.length === 0) {
        fail(`${where}: games は title id の配列（1件以上）`);
      } else {
        checkGameIds(service.games, where);
      }
    }
    if ("note" in service && !isNonEmptyString(service.note)) fail(`${where}: note は空でない文字列`);
    if ("references" in service) checkReferences(service.references, where);
  });
}

// ---- ribbons/catalog.json ----

const keys = new Set();
const routeIds = new Set();
const missingTiming = [];
// 移植版 id → 決めていない route id の一覧
const undecidedPorts = new Map([...ports.keys()].map((portId) => [portId, []]));

const checkMethods = (route, where) => {
  if (!Array.isArray(route.methods) || route.methods.length === 0) {
    fail(`${where}: methods は1件以上の配列（不要なら省略）`);
    return;
  }
  const routeGames = new Set(route.games);
  const seen = new Map(); // game → 最初に出てきた method の index

  route.methods.forEach((method, i) => {
    const mwhere = `${where} methods[${i}]`;
    if (!isPlainObject(method)) {
      fail(`${mwhere}: オブジェクトでない`);
      return;
    }
    for (const key of Object.keys(method)) {
      if (!METHOD_KEYS.has(key)) fail(`${mwhere}: 未知のキー: ${key}`);
    }

    if (!Array.isArray(method.games) || method.games.length === 0) {
      fail(`${mwhere}: games（必須）は1件以上の配列`);
    } else {
      for (const game of method.games) {
        if (!routeGames.has(game)) fail(`${mwhere}: games の ${game} が route.games に無い`);
        if (seen.has(game)) {
          fail(`${mwhere}: games の ${game} が methods[${seen.get(game)}] と重複`);
        } else {
          seen.set(game, i);
        }
      }
    }

    if (!VALID_AVAILABILITIES.has(method.availability)) {
      fail(
        `${mwhere}: availability（必須）は ${[...VALID_AVAILABILITIES].join(" / ")}: ${JSON.stringify(method.availability)}`
      );
    }

    if ("requiresServices" in method) {
      if (!Array.isArray(method.requiresServices) || method.requiresServices.length === 0) {
        fail(`${mwhere}: requiresServices は services/all.json の id の配列（1件以上。不要なら省略）`);
      } else {
        const dup = new Set();
        for (const id of method.requiresServices) {
          if (!serviceIds.has(id)) fail(`${mwhere}: requiresServices の ${id} が services/all.json に無い`);
          if (dup.has(id)) fail(`${mwhere}: requiresServices の ${id} が重複`);
          dup.add(id);
        }
      }
    }

    if (("endDate" in method || "endTime" in method) && method.availability !== "ended") {
      fail(`${mwhere}: endDate / endTime は availability: "ended" のときだけ書く`);
    }
    checkEndDateTime(method, mwhere);

    for (const key of ["requirements", "note"]) {
      if (key in method && !isNonEmptyString(method[key])) fail(`${mwhere}: ${key} は空でない文字列`);
    }
  });

  const uncovered = route.games.filter((game) => !seen.has(game));
  if (uncovered.length > 0) {
    fail(`${where}: methods の games の和が route.games と一致しない（どの method にも無い: ${uncovered.join(", ")}）`);
  }
};

const checkVerified = (v, where) => {
  if (!isPlainObject(v)) {
    fail(`${where}: verified は { method, date } のオブジェクト（実機などで確かめたときだけ書く）`);
    return;
  }
  if (!VERIFIED_METHODS.has(v.method)) {
    fail(`${where}: verified.method は ${[...VERIFIED_METHODS].join(" / ")}: ${JSON.stringify(v.method)}`);
  }
  if (!isDate(v.date)) fail(`${where}: verified.date は YYYY-MM-DD: ${JSON.stringify(v.date)}`);
  if ("fields" in v && (!Array.isArray(v.fields) || v.fields.some((f) => !isNonEmptyString(f)))) {
    fail(`${where}: verified.fields は文字列の配列`);
  }
  for (const key of Object.keys(v)) {
    if (!["method", "date", "fields"].includes(key)) fail(`${where}: verified に未知のキー: ${key}`);
  }
};

// excludedPorts（任意）: この route には移植版を入れない、と決めたもの。検証済みの集合を返す
const checkExcludedPorts = (route, where) => {
  const excluded = new Set();
  if (!("excludedPorts" in route)) return excluded;
  if (!Array.isArray(route.excludedPorts) || route.excludedPorts.length === 0) {
    fail(`${where}: excludedPorts は移植版の title id の配列（1件以上。不要なら省略）`);
    return excluded;
  }
  for (const portId of route.excludedPorts) {
    if (!ports.has(portId)) {
      fail(`${where}: excludedPorts の ${portId} は移植版（portOf を持つ title）ではない`);
      continue;
    }
    if (excluded.has(portId)) fail(`${where}: excludedPorts の ${portId} が重複`);
    excluded.add(portId);
    if (route.games.includes(portId)) {
      fail(`${where}: ${portId} が games と excludedPorts の両方にある`);
    }
    if (!route.games.includes(ports.get(portId))) {
      fail(`${where}: excludedPorts の ${portId} の移植元 ${ports.get(portId)} が games に無い（除外の必要なし）`);
    }
  }
  return excluded;
};

for (const entry of catalog) {
  if (keys.has(entry.key)) fail(`ribbons/catalog.json has duplicate key: ${entry.key}`);
  keys.add(entry.key);

  if (!VALID_KINDS.has(entry.kind)) {
    fail(`ribbons/catalog.json entry ${entry.key} has invalid kind: ${entry.kind}`);
  }

  for (const route of entry.routes) {
    const where = `ribbons/catalog.json route ${route.id}`;
    if (routeIds.has(route.id)) fail(`ribbons/catalog.json has duplicate route id: ${route.id}`);
    routeIds.add(route.id);

    for (const key of Object.keys(route)) {
      if (!ROUTE_KEYS.has(key)) fail(`${where}: 未知のキー: ${key}（取得可否やサービス依存は methods[] に書く）`);
    }

    if (!Array.isArray(route.games) || route.games.length === 0) {
      fail(`${where}: games は1件以上の配列`);
      continue;
    }
    checkGameIds(route.games, where);
    if (new Set(route.games).size !== route.games.length) fail(`${where}: games に重複がある`);

    // timing（必須）。未記入は件数が多くなりうるので最後にまとめて出す
    if (!("timing" in route)) {
      missingTiming.push(route.id);
    } else if (!VALID_TIMINGS.has(route.timing)) {
      fail(`${where}: timing は on_capture / post_capture: ${JSON.stringify(route.timing)}`);
    }

    if ("methods" in route) checkMethods(route, where);
    if ("references" in route) checkReferences(route.references, where);
    if ("checkedAt" in route && !isDate(route.checkedAt)) {
      fail(`${where}: checkedAt は YYYY-MM-DD: ${JSON.stringify(route.checkedAt)}`);
    }
    if ("verified" in route) checkVerified(route.verified, where);

    const excluded = checkExcludedPorts(route, where);

    // 移植版の網羅: 移植元を含む route は、移植版を入れるか除外するかを明示する
    for (const [portId, origin] of ports) {
      if (route.games.includes(origin) && !route.games.includes(portId) && !excluded.has(portId)) {
        undecidedPorts.get(portId).push(route.id);
      }
    }
  }
}

if (missingTiming.length > 0) {
  fail(
    `ribbons/catalog.json: timing（on_capture / post_capture）が無い route が ${missingTiming.length} 件:\n      ${missingTiming.join("\n      ")}`
  );
}

for (const [portId, routeList] of undecidedPorts) {
  if (routeList.length === 0) continue;
  fail(
    `ribbons/catalog.json: 移植元 ${ports.get(portId)} を含むのに、移植版 ${portId} を games に入れるか excludedPorts に書くか決めていない route が ${routeList.length} 件:\n      ${routeList.join("\n      ")}`
  );
}

// ---- mappings/ribbons.json との整合（catalog ⊇ mappings） ----

const byNameEn = new Map(catalog.map((entry) => [`${entry.kind}:${entry.name_en}`, entry]));

for (const [kind, mapping] of [["ribbon", ribbonsMap.ribbons], ["mark", ribbonsMap.marks]]) {
  for (const [en, ja] of Object.entries(mapping)) {
    const entry = byNameEn.get(`${kind}:${en}`);
    if (!entry) {
      fail(`mappings/ribbons.json ${kind} "${en}" is missing from ribbons/catalog.json`);
    } else if (entry.name_ja !== ja) {
      fail(`ribbon name mismatch for ${en}: ${ja} != ${entry.name_ja}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`pokemon-data ribbons validation failed (${errors.length} errors):`);
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("pokemon-data ribbons validation passed.");
