// 配信正本化 Phase B「anchor 一致による凍結id」の共有ライブラリ。
//
// L2形状のentry（games=配列, startDate="YYYY-MM-DD"文字列, distributionMethod=文字列, dexNo=整数）を
// 受け取り、同一配信イベントを指し示す「anchor」を計算する純関数群。副作用なし。
//
// primary anchor = (dexNo, startDate, games, distributionMethod)
// relaxed anchor = (dexNo, startDate, distributionMethod)  ※games を含めない緩め版（監査用）
//
// scripts/scrape-to-l2.mjs（Phase A）が出力するstaged L2 entryを、
// distributions/gen5.json〜gen9.json の既存entryとanchor一致させて
// upsert/新規id採番するB2から import される想定。

// キー連結の区切り文字。要素値に現れない制御文字（SOH: Start of Heading）を使い、
// dexNo/startDate/method 等の値同士の偶発衝突を避ける。
const SOH = "";

// entryから安全に文字列を取り出す。undefined/null は空文字列として扱う（防御。正本entryは必須項目なので通常は全部揃う）。
function toKeyPart(value) {
  return value === undefined || value === null ? "" : String(value);
}

// games配列を昇順ソートして "+" 連結した文字列を返す。
function joinGames(entry) {
  const games = Array.isArray(entry?.games) ? [...entry.games].sort() : [];
  return games.join("+");
}

// primary anchor key: (dexNo, startDate, games, distributionMethod)
export function anchorKey(entry) {
  const dexNo = toKeyPart(entry?.dexNo);
  const startDate = toKeyPart(entry?.startDate);
  const gamesJoined = joinGames(entry);
  const method = toKeyPart(entry?.distributionMethod);
  return [dexNo, startDate, gamesJoined, method].join(SOH);
}

// relaxed anchor key: (dexNo, startDate, distributionMethod) ※games を含めない
export function relaxedKey(entry) {
  const dexNo = toKeyPart(entry?.dexNo);
  const startDate = toKeyPart(entry?.startDate);
  const method = toKeyPart(entry?.distributionMethod);
  return [dexNo, startDate, method].join(SOH);
}

// entries配列を anchorKey ごとにグループ化した Map<string, entry[]> を返す。
export function buildAnchorIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    const key = anchorKey(entry);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  }
  return index;
}

// entries配列を relaxedKey ごとにグループ化した Map<string, entry[]> を返す。
export function buildRelaxedIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    const key = relaxedKey(entry);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  }
  return index;
}
