// ポケモンJSONデータのプロパティ名を日本語から英語に変換するスクリプト✨
// 実行するとgen8_dist_list_en.jsonという名前で英語版のファイルが作られるよ！

import * as fs from 'fs';

// 日本語→英語の変換マップを定義
const propertyMap: Record<string, string> = {
  "管理ID": "managementId",
  "ポケモン名": "pokemonName",
  "色違い": "shiny",
  "全国図鑑No": "dexNo",
  "世代": "generation",
  "ゲーム": "game",
  "配信イベント名": "eventName",
  "配信方法": "distributionMethod",
  "配信場所": "distributionLocation",
  "配信開始日": "startDate",
  "配信終了日": "endDate",
  "親名": "ot",
  "ID": "trainerId",
  "出会った場所": "metLocation",
  "ボール": "ball",
  "レベル": "level",
  "せいべつ": "gender",
  "とくせい": "ability",
  "せいかく": "nature",
  "キョダイマックス": "gigantamax",
  "テラスタイプ": "teraType",
  "持ち物": "heldItem",
  "技1": "move1",
  "技2": "move2",
  "技3": "move3",
  "技4": "move4",
  "リボン1": "ribbon1",
  "リボン2": "ribbon2",
  "リボン3": "ribbon3",
  "その他特記事項": "notes",
  "タイムスタンプ": "timestamp"
};

// メイン処理
try {
  // JSONファイルのパス
  const filePath = '/Users/akabros/Documents/code/pokemon-data/event-pokemon/gen8_dist_list.json';
  
  // JSONを読み込む
  console.log('JSONファイルを読み込み中...');
  const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // 全部のポケモンデータを処理していくよ！
  console.log('プロパティ名を変換中...');
  const convertedData = jsonData.map((pokemon: any) => {
    const newPokemon: Record<string, any> = {};
    
    // 各プロパティを英語に変換
    for (const [japaneseKey, value] of Object.entries(pokemon)) {
      // 英語のキー名を取得（マップにない場合は元のキーを使う）
      const englishKey = propertyMap[japaneseKey] || japaneseKey;
      newPokemon[englishKey] = value;
    }
    
    return newPokemon;
  });
  
  // 新しいJSONファイルを保存（きれいに整形して）
  const outputPath = filePath.replace('.json', '_en.json');
  fs.writeFileSync(outputPath, JSON.stringify(convertedData, null, 2), 'utf8');
  
  console.log(`✨変換完了！新しいファイルを保存したよ: ${outputPath}`);
} catch (error) {
  console.error('変換中にエラーが発生しちゃった💦:', error);
}
