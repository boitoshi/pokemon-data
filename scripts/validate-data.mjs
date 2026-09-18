import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractsPath = path.join(root, "schemas", "data-contracts.json");
const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf8"));

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

for (const [relativePath, contract] of Object.entries(contracts)) {
  const payload = readJson(relativePath);
  const entries = Array.isArray(payload) ? payload : Object.values(payload);

  if (entries.length < contract.minEntries) {
    throw new Error(`${relativePath} has too few entries: ${entries.length}`);
  }

  for (const key of contract.requiredKeys) {
    const missingIndex = entries.findIndex((entry) => !(key in entry));
    if (missingIndex !== -1) {
      throw new Error(`${relativePath} entry ${missingIndex} is missing required key: ${key}`);
    }
  }
}

const pokemon = readJson("pokemon/all.json");
const pokemonNames = readJson("mappings/pokemon_names.json");
for (const [apiKey, mapping] of Object.entries(pokemonNames)) {
  const dexKey = String(mapping.dex_no);
  const pokemonEntry = pokemon[dexKey];
  if (!pokemonEntry) {
    throw new Error(`mappings/pokemon_names.json references missing dex number: ${mapping.dex_no}`);
  }
  if (pokemonEntry.name_ja !== mapping.ja) {
    throw new Error(`pokemon name mismatch for ${apiKey}: ${mapping.ja} != ${pokemonEntry.name_ja}`);
  }
}

for (const entry of Object.values(pokemon)) {
  if (!Array.isArray(entry.types) || entry.types.length === 0) {
    throw new Error(`pokemon/all.json has pokemon without types: ${entry.name_ja}`);
  }

  for (const form of entry.forms ?? []) {
    for (const key of ["form_id", "form_name_ja", "form_name_en", "category"]) {
      if (!(key in form)) {
        throw new Error(`pokemon/all.json form is missing required key: ${key}`);
      }
    }
  }
}

// pokemon/history.json（種族・フォームの時系列の事実。ADR 0016）
const history = readJson("pokemon/history.json");
const groups = readJson("games/groups.json");
const validDebutGames = new Set(groups.map((g) => g.id));
const validTypes = new Set(Object.values(readJson("mappings/types.json")));

if (typeof history._note !== "string" || !history._note) {
  throw new Error("pokemon/history.json is missing _note");
}
if (typeof history.lastUpdated !== "string" || !history.lastUpdated) {
  throw new Error("pokemon/history.json is missing lastUpdated");
}
if (!Array.isArray(history.pokemon) || history.pokemon.length === 0) {
  throw new Error("pokemon/history.json has no pokemon entries");
}

const validateTypeHistory = (typeHistory, label) => {
  let prevUntilGen = -Infinity;
  for (const th of typeHistory) {
    if (!Number.isInteger(th.untilGeneration)) {
      throw new Error(`pokemon/history.json ${label}: untilGeneration must be an integer`);
    }
    if (th.untilGeneration < 1 || th.untilGeneration >= 9) {
      throw new Error(`pokemon/history.json ${label}: untilGeneration out of range (1-8): ${th.untilGeneration}`);
    }
    if (th.untilGeneration <= prevUntilGen) {
      throw new Error(`pokemon/history.json ${label}: typeHistory must be strictly ascending by untilGeneration`);
    }
    prevUntilGen = th.untilGeneration;
    if (!Array.isArray(th.types) || th.types.length === 0) {
      throw new Error(`pokemon/history.json ${label}: typeHistory entry has no types`);
    }
    for (const t of th.types) {
      if (!validTypes.has(t)) {
        throw new Error(`pokemon/history.json ${label}: unknown type '${t}'`);
      }
    }
  }
};

for (const entry of history.pokemon) {
  const dexKey = String(entry.dexNo);
  const pokemonEntry = pokemon[dexKey];
  if (!pokemonEntry) {
    throw new Error(`pokemon/history.json references missing dex number: ${entry.dexNo}`);
  }
  if (pokemonEntry.name_ja !== entry.pokemonName) {
    throw new Error(
      `pokemon/history.json name mismatch for dexNo ${entry.dexNo}: ${entry.pokemonName} != ${pokemonEntry.name_ja}`
    );
  }

  if (entry.typeHistory) {
    validateTypeHistory(entry.typeHistory, `dexNo ${entry.dexNo} (species)`);
    const currentTypes = new Set(pokemonEntry.types);
    const lastSegment = entry.typeHistory[entry.typeHistory.length - 1];
    if (
      lastSegment.types.length === currentTypes.size &&
      lastSegment.types.every((t) => currentTypes.has(t))
    ) {
      throw new Error(
        `pokemon/history.json dexNo ${entry.dexNo} (species): past types equal current types`
      );
    }
  }

  const existingFormIds = new Set((pokemonEntry.forms ?? []).map((f) => f.form_id));
  for (const form of entry.forms ?? []) {
    if (!form.formId) {
      throw new Error(`pokemon/history.json dexNo ${entry.dexNo}: form is missing formId`);
    }
    const label = `dexNo ${entry.dexNo} form ${form.formId}`;

    if (form.typeHistory) {
      validateTypeHistory(form.typeHistory, label);
    }

    if (form.debutGame) {
      if (!validDebutGames.has(form.debutGame)) {
        throw new Error(`pokemon/history.json ${label}: unknown debutGame '${form.debutGame}'`);
      }
      if (existingFormIds.has(form.formId)) {
        throw new Error(
          `pokemon/history.json ${label}: debutGame duplicates all.json forms (already has debut_game there)`
        );
      }
    }

    if (!form.typeHistory && !form.debutGame) {
      throw new Error(`pokemon/history.json ${label}: form has neither typeHistory nor debutGame`);
    }
  }
}

console.log("pokemon-data validation passed.");
