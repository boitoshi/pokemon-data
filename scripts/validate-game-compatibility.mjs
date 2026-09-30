import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const pokemon = readJson('../pokemon/all.json');
const groups = readJson('../games/groups.json');
const compatibility = readJson('../pokemon/game-compatibility.json');
const progression = readJson('../games/progression-gates.json');
const groupIds = new Set(groups.map((group) => group.id));
const dexNos = new Set(Object.keys(pokemon).map(Number));
const errors = [];

function checkGroupIds(ids, where) {
  for (const id of ids) {
    if (!groupIds.has(id)) errors.push(`${where}: 不明なグループ ${id}`);
  }
}

function checkSources(sources, where) {
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`${where}: 出典がない`);
    return;
  }
  for (const source of sources) {
    const url = typeof source === 'string' ? source : source.url;
    if (!url?.startsWith('https://')) errors.push(`${where}: 出典URLが不正`);
  }
}

if (compatibility.schemaVersion !== 1 || progression.schemaVersion !== 1) {
  errors.push('想定外の schemaVersion');
}

const coveredGroups = new Set();
for (const rule of compatibility.legacyRules) {
  checkGroupIds(rule.groupIds, 'legacyRules');
  if (!dexNos.has(rule.throughDexNo)) errors.push(`legacyRules: 範囲外の図鑑番号 ${rule.throughDexNo}`);
  for (const id of rule.groupIds) {
    if (coveredGroups.has(id)) errors.push(`互換性グループ ${id} が重複`);
    coveredGroups.add(id);
  }
}
checkSources(compatibility.legacyRuleSources, 'legacyRules');

const expectedCounts = { LPLE: 153, SwSh: 664, BDSP: 493, LA: 242, SV: 733, ZA: 364 };
for (const group of compatibility.explicitGroups) {
  checkGroupIds([group.groupId], 'explicitGroups');
  if (coveredGroups.has(group.groupId)) errors.push(`互換性グループ ${group.groupId} が重複`);
  coveredGroups.add(group.groupId);
  const ids = group.speciesDexNos;
  if (!Array.isArray(ids) || ids.length === 0) {
    errors.push(`${group.groupId}: 種族一覧が空`);
    continue;
  }
  if (!(group.groupId in expectedCounts) || ids.length !== expectedCounts[group.groupId] || group.speciesCount !== ids.length) {
    errors.push(`${group.groupId}: 出典と照合した種族数が一致しない`);
  }
  for (let i = 0; i < ids.length; i++) {
    if (!dexNos.has(ids[i])) errors.push(`${group.groupId}: 不明な全国図鑑番号 ${ids[i]}`);
    if (i > 0 && ids[i - 1] >= ids[i]) errors.push(`${group.groupId}: 一覧が昇順・重複なしではない`);
  }
  checkSources(group.sources, group.groupId);
}

for (const group of compatibility.unverifiedGroups) {
  checkGroupIds([group.groupId], 'unverifiedGroups');
  if (coveredGroups.has(group.groupId)) errors.push(`互換性グループ ${group.groupId} が重複`);
  coveredGroups.add(group.groupId);
  if (!group.reason) errors.push(`${group.groupId}: 未確認の理由がない`);
}
for (const group of compatibility.outOfScopeGroups) {
  checkGroupIds(group.groupIds, 'outOfScopeGroups');
  for (const id of group.groupIds) {
    if (coveredGroups.has(id)) errors.push(`互換性グループ ${id} が重複`);
    coveredGroups.add(id);
  }
  if (!group.reason) errors.push('対象外グループに理由がない');
}
for (const id of groupIds) {
  if (!coveredGroups.has(id)) errors.push(`互換性グループ ${id} の分類がない`);
}

const gateIds = new Set();
for (const gate of progression.gates) {
  if (gateIds.has(gate.id)) errors.push(`進行度ゲート ${gate.id} が重複`);
  gateIds.add(gate.id);
  checkGroupIds(gate.gameGroupIds, gate.id);
  if (!['pokemon_arrival', 'ribbon_facility'].includes(gate.kind)) {
    errors.push(`${gate.id}: kind が不正`);
  }
  if (!gate.method || !Array.isArray(gate.requirements) || gate.requirements.length === 0) {
    errors.push(`${gate.id}: 方法または解放条件がない`);
  }
  checkSources(gate.sources, gate.id);
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(
  `ゲーム互換性: ${compatibility.explicitGroups.length}グループ、進行度ゲート: ${progression.gates.length}件を検証しました`
);
