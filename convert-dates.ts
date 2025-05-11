// TypeScriptでISO8601形式の日付をYYYY-MM-DD形式に変換するコード
// 配信開始日と配信終了日を変換する例。
// 1. TypeScriptをインストールしていない場合は、npm install -g typescriptでインストール。
// 2. ts-nodeをインストールしていない場合は、npm install -g ts-nodeでインストール。
// ターミナルでnpx ts-node convert-dates.tsを実行。

// 日付部分だけを抽出する関数
function extractDateOnly(isoDateString: string): string {
  // 日付部分（YYYY-MM-DD）だけを取り出す
  return isoDateString.split("T")[0];
}

// JSONファイルを読み込んで処理して保存するコード
import * as fs from 'fs';

// ファイルを読み込む
const filePath = '/Users/akabros/Documents/code/pokemon-data/event-pokemon/gen8_dist_list.json';
const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// すべてのデータを処理する
jsonData.forEach((pokemon: any) => {
  // 配信開始日の処理
  if (pokemon.配信開始日) {
    pokemon.配信開始日 = extractDateOnly(pokemon.配信開始日);
  }
  
  // 配信終了日の処理（空文字の場合はスキップ）
  if (pokemon.配信終了日 && pokemon.配信終了日 !== "") {
    pokemon.配信終了日 = extractDateOnly(pokemon.配信終了日);
  }
});

// 処理したJSONを保存
fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
