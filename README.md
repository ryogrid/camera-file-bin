# camera-file-bin (Data Matrix File Transfer)

## 概要
ブラウザでファイルを Data Matrix 形式の画像を連続表示し、スマホのカメラで撮影して復元する PoC。  
シンプルな冗長性機能により、一部のフレームが欠損しても復元可能です。

## 特徴
- 元のファイル名を保持してダウンロード
- Data Matrixコード形式での画像送信（パブリックドメイン）
- シャード分割による大ファイル対応
- 冗長性による誤り訂正機能

## 開発手順
1. クローン（またはこのファイル群を作成）
2. `npm install`
3. `npm run start:sender`（送信 SPA を localhost:1234 で起動）
4. `npm run start:receiver`（受信 SPA を localhost:1235 で起動）
   - `localhost` は開発における Secure Context の例外となるため `getUserMedia()` が利用できます。
5. 本番は `npm run build` → static 出力を HTTPS 配信（GitHub Pages / Netlify / Cloudflare Pages 等）へデプロイしてください。

## 注意点（重要）
- `@subspace/reed-solomon-erasure.wasm` 等の WASM パッケージは **実際の API 名が異なる可能性**があります。`encoder.js` / `decoder.js` の `rs.encode` / `rs.decode` 呼び出しが動かない場合は、パッケージの README を確認して呼び出し名を合わせてください。
- 商用利用時は採用する Reed–Solomon 実装のライセンスを確認してください（多くは MIT/Apache）。また RaptorQ のような特許のあるコードは使わない構成としています。

## ライセンス
本プロジェクトは MIT ライセンス（`LICENSE`）です。第三者ライブラリのライセンスは `NOTICE` を参照してください。