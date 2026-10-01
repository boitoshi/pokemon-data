// 取得結果の欠落・PWT祖先・未翻訳値を正本validatorが拒否する回帰検証。
import assert from "node:assert/strict";
import { validateRoster, validateGymLeaders } from "./validate-gym-leaders.mjs";

const masters = {
  pokemon: { "25": { name_ja: "ピカチュウ" } },
  types: new Set(["electric"]), regions: new Set(["カントー"]),
};
const row = { page: "Test", ja: "テスト", region: "カントー", order: 1, type_en: "Electric" };
const roster = { source: "https://bulbapedia.bulbagarden.net/wiki/Gym_Leader", scope: "テスト", trainers: [row] };
const data = {
  source: "Bulbapedia", trainers: [{ ...row, role: "gym_leader", role_ja: "ジムリーダー", type_ja: "でんき", parties: [{
    game: "RGB", section: "Red and Blue", location: "Test Gym",
    game_ja: "赤・緑・青", section_ja: "赤・緑・青", section_needs_review: false,
    section_path: ["In the core series games", "Pokémon", "Red and Blue"],
    team: [{ ndex: "0025", ja: "ピカチュウ", moves: [{ en: "Growl", ja: "なきごえ" }] }],
  }] }],
};
assert.deepEqual(validateRoster(roster, masters), []);
assert.deepEqual(validateGymLeaders(data, roster, masters), []);
/** 正常fixtureのコピーに異常を注入し、対応するエラーを確認する。 */
function rejects(change, pattern) {
  const altered = structuredClone(data);
  change(altered);
  assert.match(validateGymLeaders(altered, roster, masters).join("\n"), pattern);
}
rejects((copy) => { copy.trainers = []; }, /欠落/);
rejects((copy) => { copy.trainers.push(copy.trainers[0]); }, /page重複/);
rejects((copy) => { copy.trainers[0].parties[0].team = []; }, /teamが空/);
rejects((copy) => { copy.trainers[0].parties[0].location = "Pokémon World Tournament"; }, /PWT/);
rejects((copy) => { copy.trainers[0].parties[0].section_path.unshift("PWT"); }, /PWT/);
rejects((copy) => { delete copy.trainers[0].parties[0].section_path; }, /見出し参照/);
rejects((copy) => { copy.trainers[0].parties[0].team[0].ja = "Pikachu"; }, /マスター不一致/);
rejects((copy) => { copy.trainers[0].parties[0].team[0].moves[0].ja = "Growl"; }, /未変換/);
rejects((copy) => { copy.trainers[0].parties[0].team[0].moves[0].ja = "未確認"; }, /未変換/);
rejects((copy) => { copy.trainers[0].role = "champion"; }, /gym_leader/);
rejects((copy) => { copy.trainers[0].type_ja = ""; }, /日本語表示/);
rejects((copy) => { copy.trainers[0].parties[0].game_ja = ""; }, /game_ja/);
rejects((copy) => { copy.trainers[0].parties[0].section_ja = "Unknown section"; }, /section_needs_review/);
const pendingSection = structuredClone(data);
pendingSection.trainers[0].parties[0].section_ja = "Unknown section";
pendingSection.trainers[0].parties[0].section_needs_review = true;
assert.deepEqual(validateGymLeaders(pendingSection, roster, masters), []);
const duplicateRoster = { ...roster, trainers: [row, { ...row }] };
assert.match(validateRoster(duplicateRoster, masters).join("\n"), /page重複/);
assert.match(validateRoster(duplicateRoster, masters).join("\n"), /orderが重複/);
assert.match(validateRoster({ ...roster, trainers: [{ ...row, type_en: "Unknown" }] }, masters).join("\n"), /未知の専門タイプ/);
const rematch = { section: "Rematch", location: "Test Gym" };
assert.deepEqual(validateRoster({ ...roster, trainers: [{ ...row, allowed_rematches: [rematch] }] }, masters), []);
assert.match(validateRoster({ ...roster, trainers: [{ ...row, allowed_rematches: [rematch, rematch] }] }, masters).join("\n"), /再戦例外が重複/);
assert.match(validateRoster({ ...roster, trainers: [{ ...row, allowed_rematches: [{ section: "" }] }] }, masters).join("\n"), /section\/location/);
console.log("Gym leader validator regression checks passed.");
