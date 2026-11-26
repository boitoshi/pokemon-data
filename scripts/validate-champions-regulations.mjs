import { existsSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const divisions = ["species", "forms", "megas"];
const roles = new Set([
  "official-additions", "official-cumulative", "official-named", "official-count",
  "secondary-additions", "secondary-cumulative", "reference",
]);
const announcedFields = {
  species: "announcedSpeciesCount",
  total: "announcedTotalCount",
  megas: "announcedMegaCount",
};
const root = new URL("../", import.meta.url);
const canonicalPath = "games/champions-regulations.json";
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const text = (value) => typeof value === "string" && value.trim().length > 0;
const normalize = (value) => value.normalize("NFKC").toLowerCase()
  .replace(/[’‘]/g, "'").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
const pair = (dexNo, name) => JSON.stringify([dexNo, name]);
const contains = (set, subset) => [...subset.keys()].every((key) => set.has(key));
const equal = (a, b) => a.size === b.size && contains(a, b);
const minus = (a, b) => new Map([...a].filter(([key]) => !b.has(key)));
const intersect = (a, b) => new Map([...a].filter(([key]) => b.has(key)));

function date(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

function jst(value) {
  return typeof value === "string" && date(value.slice(0, 10))
    && (value.length === 10 || /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d\+09:00$/.test(value));
}

function checkUrl(value, label) {
  assert(text(value) && /^https?:\/\//.test(value), `${label}: invalid source URL`);
  return new URL(value);
}

function registries(master, names, special, formKeys) {
  const speciesNames = new Map();
  const megaNames = new Map();
  const megas = new Map();
  const listedForms = new Map();
  const unlistedForms = new Map();
  const forms = new Map();
  const formAliases = new Map();
  function registerName(index, name, key) {
    if (!text(name)) return;
    const alias = normalize(name);
    assert(!index.has(alias) || index.get(alias) === key, `Ambiguous name: ${name}`);
    index.set(alias, key);
  }

  for (const { no, name_ja, name_en } of Object.values(master)) {
    registerName(speciesNames, name_ja, no);
    registerName(speciesNames, name_en, no);
  }
  for (const [alias, { en, ja, dex_no: dexNo }] of Object.entries(names)) {
    if (master[dexNo]?.name_ja !== ja) continue;
    for (const name of [alias, en, ja]) registerName(speciesNames, name, dexNo);
  }

  const definitions = new Map();
  for (const { dexNo, forms: entries } of special.pokemon) {
    definitions.set(dexNo, [...(definitions.get(dexNo) ?? []), ...entries]);
  }
  for (const [dexNo, entries] of definitions) {
    for (const entry of entries.filter(({ category }) => category === "mega")) {
      const { formName } = entry;
      const key = pair(dexNo, formName);
      assert(master[dexNo]?.forms?.some((form) =>
        form.category === "mega" && form.form_name_ja === formName), `Unknown Mega in master: ${key}`);
      megas.set(key, { dexNo, formName });
      const suffix = formName.match(/[XYZ]$/)?.[0];
      const english = `Mega ${master[dexNo].name_en}${suffix ? ` ${suffix}` : ""}`;
      registerName(megaNames, formName, key);
      registerName(megaNames, english, key);
      registerName(megaNames, english.replace(/ /g, "-"), key);
    }
  }

  for (const form of formKeys) {
    const { dexNo, formId, formName, regionName, sourceKey, aliases } = form;
    const key = pair(dexNo, formId);
    assert(Number.isInteger(dexNo) && master[dexNo] && text(formId), `Invalid form key: ${key}`);
    assert(!forms.has(key), `Duplicate form key: ${key}`);
    assert(Array.isArray(aliases) && aliases.length && aliases.every(text), `Missing form aliases: ${key}`);
    const display = master[dexNo].forms?.find((entry) =>
      entry.form_id === formId && !["mega", "gigantamax", "zmove"].includes(entry.category));
    if (sourceKey !== undefined) {
      assert(text(sourceKey) && formName === undefined && regionName === undefined, `Invalid unlisted form: ${key}`);
      const storageKey = pair(dexNo, sourceKey);
      assert(!unlistedForms.has(storageKey), `Duplicate unlisted form: ${storageKey}`);
      unlistedForms.set(storageKey, key);
    } else {
      assert(text(formName) && (regionName === null || text(regionName)), `Invalid form display: ${key}`);
      const definition = definitions.get(dexNo)?.find((entry) =>
        entry.formName === formName && (entry.regionName ?? null) === regionName
        && !["mega", "gigantamax", "zmove"].includes(entry.category));
      const displayName = regionName ? `${formName}（${regionName}）` : formName;
      assert(definition && display?.form_name_ja === displayName, `Unrecognized form display: ${key}`);
      const storageKey = JSON.stringify([dexNo, formName, regionName]);
      assert(!listedForms.has(storageKey), `Duplicate form display: ${storageKey}`);
      listedForms.set(storageKey, key);
    }
    const normalizedAliases = new Set(aliases.map(normalize));
    for (const alias of normalizedAliases) {
      const aliasKey = pair(dexNo, alias);
      assert(!formAliases.has(aliasKey), `Ambiguous form alias: ${aliasKey}`);
      formAliases.set(aliasKey, key);
    }
    forms.set(key, { ...form, aliases: normalizedAliases });
  }
  return { master, speciesNames, megaNames, megas, forms, listedForms, unlistedForms };
}

function resolveRow(division, row, registry, label) {
  const name = row.name ?? row.raw;
  assert(text(name), `${label}: missing source label`);
  const alias = normalize(name);
  if (division === "species") {
    assert(Number.isInteger(row.key) && registry.speciesNames.get(alias) === row.key,
      `${label}: species label/key mismatch: ${name} / ${row.key}`);
    return row.key;
  }
  const { dexNo, formName, formId } = row.key ?? {};
  if (division === "megas") {
    const key = pair(dexNo, formName);
    assert(registry.megaNames.get(alias) === key, `${label}: Mega label/key mismatch: ${name} / ${key}`);
    return key;
  }
  const key = pair(dexNo, formId);
  assert(registry.forms.get(key)?.aliases.has(alias), `${label}: form alias/key mismatch: ${name} / ${key}`);
  return key;
}

function loadEvidence(id, division, registry) {
  const file = `games/champions-verification/${id}.${division}.json`;
  if (!existsSync(new URL(file, root))) return { sources: [] };

  const { regulationId, division: scope, sources } = read(file);
  assert(regulationId === id && scope === division, `${file}: evidence scope mismatch`);
  assert(Array.isArray(sources) && sources.length, `${file}: evidence has no sources`);
  const sourceIds = new Set();
  return {
    file,
    sources: sources.map((source) => {
      const { url, checkedAt, role, location, rows, zeroReason, independenceGroup, counts = [] } = source;
      const label = `${file} (${url})`;
      checkUrl(url, label);
      assert(date(checkedAt) && text(location) && roles.has(role), `${label}: invalid source metadata`);
      assert(source.regulationId === id && source.division === division, `${label}: source scope mismatch`);
      const identity = pair(url, role);
      assert(!sourceIds.has(identity), `${label}: duplicate source and role`);
      sourceIds.add(identity);
      if (role.startsWith("secondary-")) {
        assert(text(independenceGroup), `${label}: missing secondary source group`);
      }
      assert(Array.isArray(rows) && Array.isArray(counts), `${label}: rows and counts must be arrays`);
      const keys = new Map();
      let unresolved = false;
      for (const [index, row] of rows.entries()) {
        const rowLabel = `${label} row ${index + 1}`;
        assert(text(row.raw) && text(row.reason), `${rowLabel}: missing raw label or reason`);
        if (row.status === "confirmed") {
          const key = resolveRow(division, row, registry, rowLabel);
          assert(!keys.has(key), `${rowLabel}: duplicate resolved key ${key}`);
          keys.set(key, row.name ?? row.raw);
        } else {
          assert(row.status === "excluded" || row.status === "unresolved", `${rowLabel}: invalid status`);
          assert(row.key === undefined, `${rowLabel}: only confirmed rows can have a key`);
          unresolved ||= row.status === "unresolved";
        }
      }
      if (zeroReason !== undefined) {
        assert(text(zeroReason) && keys.size === 0 && !unresolved, `${label}: invalid zero evidence`);
      }
      for (const { scope, count, reason } of counts) {
        assert([...divisions, "total"].includes(scope) && Number.isInteger(count) && count >= 0 && text(reason),
          `${label}: invalid tally`);
      }
      return { ...source, keys, unresolved, counts };
    }),
  };
}

function verifyReferences(round, evidence) {
  const { id, references, secondaryTallies = [], announcementNotes = {} } = round;
  assert(Array.isArray(references) && references.length, `${id}: missing references`);
  for (const ref of references) {
    checkUrl(ref.url, id);
    assert(date(ref.checkedAt) && Array.isArray(ref.fields) && ref.fields.length && ref.fields.every(text),
      `${id}: invalid reference metadata for ${ref.url}`);
  }
  for (const boundary of ["start", "end"]) {
    assert(references.some((ref) => ref.fields.includes(boundary)), `${id}: missing reference for ${boundary}`);
  }
  const sources = Object.values(evidence).flatMap(({ sources }) => sources);
  for (const [scope, field] of Object.entries(announcedFields)) {
    const officialSources = sources.filter((source) =>
      (source.role.startsWith("official-") || source.official === true)
      && source.counts.some((count) => count.scope === scope));
    if (round[field] === undefined && officialSources.length === 0) continue;
    const count = round[field];
    assert(Number.isInteger(count) && count >= 0 && officialSources.length
      && officialSources.every((source) =>
        source.counts.filter((entry) => entry.scope === scope).every((entry) => entry.count === count)),
    `${id}: ${field} does not match official count evidence`);
    assert(officialSources.some((source) => references.some((ref) =>
      ref.url === source.url && ref.fields.includes(field))), `${id}: missing reference for ${field}`);
  }
  assert(Array.isArray(secondaryTallies), `${id}: invalid secondaryTallies`);
  for (const tally of secondaryTallies) {
    checkUrl(tally.url, id);
    assert(date(tally.checkedAt) && [...divisions, "total"].includes(tally.scope)
      && Number.isInteger(tally.count) && tally.count >= 0 && text(tally.note),
    `${id}: invalid secondary tally`);
  }
  for (const [division, note] of Object.entries(announcementNotes)) {
    assert(divisions.includes(division) && text(note.text) && references.some((ref) => ref.url === note.sourceUrl),
      `${id}: invalid announcement note for ${division}`);
  }
}

function secondaryAdditions(sources, history, roundIndex, division, label) {
  const lists = [];
  const groups = new Set();
  const urls = new Set();
  for (const source of sources.filter(({ role }) => role.startsWith("secondary-"))) {
    const { independenceGroup: group, url } = source;
    assert(!groups.has(group) && !urls.has(url), `${label}: secondary lists must identify independent sources`);
    groups.add(group);
    urls.add(url);
    let keys = source.keys;
    let unresolved = source.unresolved;
    const previous = history.get(group);
    if (source.role === "secondary-cumulative" && roundIndex > 0) {
      assert(previous?.roundIndex === roundIndex - 1, `${label}: missing previous cumulative list for ${source.url}`);
      assert(source.unresolved || contains(keys, previous.keys), `${label}: secondary cumulative list omits prior keys`);
      keys = minus(keys, previous.keys);
      unresolved ||= previous.unresolved;
    }
    history.set(group, {
      roundIndex,
      keys: source.role === "secondary-cumulative" ? source.keys : new Map([...(previous?.keys ?? []), ...keys]),
      unresolved: source.role === "secondary-cumulative" ? source.unresolved : unresolved || previous?.unresolved,
    });
    lists.push({ ...source, keys, unresolved });
  }
  return lists;
}

function outcome(method, result, coverage, publishable, keys) {
  return { method, result, coverage, publishable, keys };
}

function derive(division, evidence, secondary, preceding, label, announcedCount) {
  const { file, sources } = evidence;
  if (!file) return outcome("unresearched", "unresearched", "partial", false, new Map());

  const named = new Map(sources.filter((source) => source.role === "official-named")
    .flatMap((source) => [...source.keys]));
  const additions = sources.filter((source) => source.role === "official-additions");
  const cumulative = division === "forms" ? [] : sources.filter((source) => source.role === "official-cumulative");
  assert(additions.length <= 1 && cumulative.length <= 1, `${label}: multiple current official lists`);
  const verifyOfficial = (keys, complete) => {
    assert(announcedCount === undefined || (complete ? keys.size === announcedCount : keys.size <= announcedCount),
      `${label}: additions contradict official count ${announcedCount}`);
    assert(!complete || contains(keys, named), `${label}: additions contradict official named Pokémon`);
  };

  if (additions.length) {
    const { keys, unresolved, zeroReason } = additions[0];
    const complete = !unresolved && (keys.size > 0 || Boolean(zeroReason));
    verifyOfficial(keys, complete);
    return outcome("official-additions", complete ? "verified" : "pending", complete ? "complete" : "partial", complete, keys);
  }

  if (cumulative.length) {
    const source = cumulative[0];
    const coversPrevious = contains(source.keys, preceding.keys);
    assert(source.unresolved || coversPrevious, `${label}: official cumulative list omits prior keys`);
    const complete = preceding.complete && !source.unresolved && coversPrevious;
    const keys = preceding.complete && coversPrevious ? minus(source.keys, preceding.keys) : new Map();
    verifyOfficial(keys, complete);
    if (!source.unresolved) {
      assert(contains(source.keys, named), `${label}: official cumulative list omits officially named Pokémon`);
    }
    return outcome("official-cumulative", complete ? "verified" : "pending", complete ? "complete" : "partial", complete, keys);
  }

  if (announcedCount !== undefined) {
    const matching = secondary.find((candidate) => !candidate.unresolved
      && candidate.keys.size === announcedCount && (announcedCount > 0 || candidate.zeroReason)
      && contains(candidate.keys, named)
      && secondary.every((other) => contains(candidate.keys, other.keys)
        && (other.unresolved || equal(candidate.keys, other.keys))));
    if (matching) return outcome("official-count-plus-list", "verified", "complete", true, matching.keys);
  }

  if (secondary.length >= 2) {
    const common = secondary.map(({ keys }) => keys).reduce(intersect);
    const complete = secondary.every(({ keys, unresolved, zeroReason }) =>
      !unresolved && equal(keys, common) && (keys.size > 0 || Boolean(zeroReason)));
    verifyOfficial(common, complete);
    assert(secondary.every(({ keys, unresolved, zeroReason }) =>
      unresolved || (!keys.size && !zeroReason) || contains(keys, named)),
    `${label}: a secondary list contradicts officially named Pokémon`);
    return outcome("independent-secondary-lists", complete ? "verified" : "disputed",
      complete ? "complete" : "partial", true, common);
  }

  if (named.size) {
    verifyOfficial(named, false);
    return outcome("official-named", "named", "partial", true, named);
  }
  return outcome("insufficient-sources", secondary.length ? "single-source" : "no-source",
    "partial", division === "forms", new Map());
}

function storedKeys(round, division, registry, label) {
  const keys = new Map();
  const record = (key) => {
    assert(!keys.has(key), `${label}: duplicate saved key ${key}`);
    keys.set(key, true);
  };
  const rows = (field) => {
    assert(Array.isArray(round[field]), `${label}: missing ${field} array`);
    return round[field];
  };
  if (division === "species") {
    for (const { dexNo, name } of rows("addedPokemon")) {
      assert(Number.isInteger(dexNo) && registry.master[dexNo]?.name_ja === name && text(name),
        `${label}: invalid saved species ${dexNo} / ${name}`);
      record(dexNo);
    }
  } else if (division === "forms") {
    for (const { dexNo, formName, regionName } of rows("addedForms")) {
      const key = registry.listedForms.get(JSON.stringify([dexNo, formName, regionName]));
      assert(key, `${label}: unknown saved form ${dexNo} / ${formName} / ${regionName}`);
      record(key);
    }
    for (const { dexNo, sourceKey, name } of rows("unlistedForms")) {
      const key = registry.unlistedForms.get(pair(dexNo, sourceKey));
      assert(key && text(name) && registry.forms.get(key).aliases.has(normalize(name)),
        `${label}: unknown saved unlisted form ${dexNo} / ${sourceKey} / ${name}`);
      record(key);
    }
  } else {
    for (const { dexNo, formName } of rows("addedMegas")) {
      const key = pair(dexNo, formName);
      assert(registry.megas.has(key), `${label}: unknown saved Mega ${key}`);
      record(key);
    }
  }
  return keys;
}

function regenerateLists(round, division, keys, registry) {
  if (division === "species") {
    round.addedPokemon = [...keys.keys()].sort((a, b) => a - b)
      .map((dexNo) => ({ dexNo, name: registry.master[dexNo].name_ja }));
  } else if (division === "forms") {
    round.addedForms = [];
    round.unlistedForms = [];
    const ordered = [...keys].sort(([a], [b]) =>
      registry.forms.get(a).dexNo - registry.forms.get(b).dexNo || a.localeCompare(b));
    for (const [key, name] of ordered) {
      const { dexNo, formName, regionName, sourceKey } = registry.forms.get(key);
      if (sourceKey === undefined) round.addedForms.push({ dexNo, formName, regionName });
      else round.unlistedForms.push({ dexNo, sourceKey, name });
    }
  } else {
    round.addedMegas = [...keys.keys()].map((key) => registry.megas.get(key))
      .sort((a, b) => a.dexNo - b.dexNo || a.formName.localeCompare(b.formName, "ja"));
  }
}

function display(verification, count) {
  const { method, result, coverage } = verification;
  if (coverage === "complete" && count === 0) return "追加なし";
  switch (method) {
    case "official-additions":
      return coverage === "complete" ? "公式の追加一覧に基づく" : "公式の追加一覧を確認中（確定分のみ）";
    case "official-cumulative":
      return coverage === "complete" ? "公式の累積一覧から算出" : "公式の累積一覧を確認中（確定分のみ）";
    case "official-count-plus-list": return "公式の公表件数と一致（名前の出典を併記）";
    case "independent-secondary-lists":
      if (coverage === "complete") return "二次出典2系統の照合に基づく";
      return count > 0 ? "出典間の不一致・未確認分あり（一致分のみ）"
        : "出典間の不一致・未確認分あり（一致を確認できた追加分は0件）";
    case "official-named": return "発表済み分のみ収録";
    case "insufficient-sources":
      return result === "single-source" ? "片方の出典のみで確認（照合未了）" : "一覧の出典なし";
    default: return "未調査（未収録）";
  }
}

function validateAndDerive(data, registry, write) {
  const summary = [];
  const ids = new Set();
  const state = Object.fromEntries(divisions.map((division) => [division, {
    keys: new Map(), complete: true, secondary: new Map(),
  }]));
  let priorStart = "";
  assert(Array.isArray(data.regulations) && data.regulations.length, "No Champions regulations");
  for (const [roundIndex, round] of data.regulations.entries()) {
    const { id, start, end } = round;
    assert(text(id) && /^[A-Z0-9-]+$/.test(id) && !ids.has(id), `Invalid or duplicate regulation ID: ${id}`);
    ids.add(id);
    assert(text(round.name) && jst(start) && jst(end) && start > priorStart && start <= end,
      `${id}: invalid name, date or chronological order`);
    priorStart = start;
    for (const field of ["addedPokemonCount", "addedMegaCount", "addedPokemonNote"]) {
      assert(!Object.hasOwn(round, field), `${id}: obsolete field ${field}`);
    }

    const evidence = Object.fromEntries(divisions.map((division) => [division, loadEvidence(id, division, registry)]));
    verifyReferences(round, evidence);
    const verification = {};
    const sections = {};
    for (const division of divisions) {
      const label = `${id} ${division}`;
      const preceding = state[division];
      const { file, sources } = evidence[division];
      const secondary = secondaryAdditions(sources, preceding.secondary, roundIndex, division, label);
      const countField = division === "forms" ? undefined : announcedFields[division];
      const { keys, ...result } = derive(division, evidence[division], secondary, preceding, label, round[countField]);
      if (file) result.evidence = file;
      verification[division] = result;
      sections[division] = { ...result, count: keys.size, display: display(result, keys.size) };
      if (write) regenerateLists(round, division, keys, registry);
      const stored = storedKeys(round, division, registry, label);
      assert(equal(stored, keys), `${label}: saved keys differ from evidence. Missing ${JSON.stringify([...minus(keys, stored).keys()])}; unexpected ${JSON.stringify([...minus(stored, keys).keys()])}`);
      for (const key of keys.keys()) {
        assert(!preceding.keys.has(key), `${label}: key ${key} was already added in ${preceding.keys.get(key)}`);
        preceding.keys.set(key, id);
      }
      preceding.complete &&= result.coverage === "complete";
      if (result.coverage === "complete" && Object.hasOwn(round.announcementNotes ?? {}, division)) {
        if (write) delete round.announcementNotes[division];
        else assert.fail(`${label}: announcement note must be removed after completion`);
      }
    }
    const results = Object.values(verification);
    const listStatus = results.every(({ coverage }) => coverage === "complete") ? "complete"
      : results.every(({ result }) => result === "unresearched") ? "none" : "partial";
    if (write) {
      round.verification = verification;
      round.listStatus = listStatus;
    } else {
      assert.deepEqual(round.verification, verification, `${id}: verification does not match evidence`);
      assert.equal(round.listStatus, listStatus, `${id}: listStatus does not match evidence`);
    }

    const available = new Set(state.species.keys.keys());
    for (const key of state.forms.keys.keys()) available.add(registry.forms.get(key).dexNo);
    for (const { dexNo, formName } of round.addedMegas) {
      if (available.has(dexNo)) continue;
      const message = `${id}: ${formName} has no recorded eligible parent form (#${dexNo})`;
      assert(!(state.species.complete && state.forms.complete), message);
      console.warn(`Warning: ${message} (species/form coverage is incomplete)`);
    }
    const total = sections.species.count + sections.forms.count;
    if (round.announcedTotalCount !== undefined && round.announcedTotalCount !== total) {
      console.warn(`Warning: ${id}: announced total ${round.announcedTotalCount}; recorded species/forms ${total}`);
    }
    summary.push({
      id, name: round.name, start, end, listStatus,
      publishable: results.every(({ publishable }) => publishable),
      divisions: sections,
    });
  }
  return summary;
}

try {
  const args = process.argv.slice(2);
  assert(args.every((arg) => arg === "--write" || arg === "--summary"),
    "Usage: node scripts/validate-champions-regulations.mjs [--write] [--summary]");
  const write = args.includes("--write");
  const data = read(canonicalPath);
  const registry = registries(read("pokemon/all.json"), read("mappings/pokemon_names.json"),
    read("forms/special-forms.json"), read("mappings/form_keys.json"));
  const summary = validateAndDerive(data, registry, write);
  if (write) writeFileSync(new URL(canonicalPath, root), `${JSON.stringify(data, null, 2)}\n`);
  if (args.includes("--summary")) console.log(JSON.stringify(summary, null, 2));
  else console.log(`Champions regulations validated: ${summary.length} rounds`);
} catch (error) {
  console.error(`Champions regulations: ${error.message}`);
  process.exitCode = 1;
}
