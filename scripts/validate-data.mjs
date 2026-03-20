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

console.log("pokemon-data validation passed.");
