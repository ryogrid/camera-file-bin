import BWIPJS from 'bwip-js';
import { encodeShards } from './encoder.js';

const fileInput = document.getElementById('file');
const startBtn = document.getElementById('start');
const status = document.getElementById('status');
const canvas = document.getElementById('canvas');

// キャンバスサイズを動的に調整
function adjustCanvasSize() {
    const container = document.querySelector('.canvas-container');
    // より大きなサイズで表示
    const maxWidth = Math.min(800, window.innerWidth - 40);
    const maxHeight = Math.min(800, window.innerHeight * 0.8);
    const size = Math.min(maxWidth, maxHeight);
    
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
}

// 初期化時とリサイズ時にcanvasサイズを調整
adjustCanvasSize();
window.addEventListener('resize', adjustCanvasSize);

// Aztec 最大ペイロードを自動推定
async function estimateMaxAztecBytes(canvas, opts = {}) {
    const scale = Math.max(1, Math.floor(canvas.width / 100));
    const layers = opts.layers || 23;
    const eccPercent = opts.ecc || 33;

    let low = 100;
    let high = 1500; // より安全な上限値
    let maxBytes = low;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const payload = 'A'.repeat(mid);
        try {
            await BWIPJS.toCanvas(canvas, {
                bcid: 'azteccode',
                text: payload,
                scale,
                layers,
                eccpercent: eccPercent,
                includetext: false,
            });
            maxBytes = mid;
            low = mid + 1;
        } catch (e) {
            high = mid - 1;
        }
    }
    return maxBytes;
}

startBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) { status.textContent = 'ファイルを選択してください'; return; }
    const shardSize = parseInt(document.getElementById('shardSize').value, 10) || 1024;
    const parity = parseInt(document.getElementById('parity').value, 10) || 4;

    status.textContent = 'QRコード 最大容量計算中...';
    
    // より安全な最大ペイロードサイズを設定（小さくして読み取りやすく）
    const MAX_QR_BYTES = 200; // QRコードの最大ペイロード
    
    status.textContent = `QRコード 最大ペイロード: ${MAX_QR_BYTES} bytes (固定値)`;

    status.textContent = 'ファイル読み込み中...';
    const arrayBuffer = await file.arrayBuffer();

    status.textContent = 'シャード符号化中...';
    const { shards, K, N, sessionId, originalSize } = await encodeShards(arrayBuffer, shardSize, parity);

    console.log('エンコード結果: ' + shards.length + ' シャード, K=' + K + ', N=' + N + ', サイズ=' + originalSize);

    // シャードを QRコードに収まるサブシャードに分割
    const frames = [];
    for (let idx = 0; idx < shards.length; idx++) {
        const shard = shards[idx];
        if (!shard) {
            console.error(`シャード ${idx} が undefined です`);
            continue;
        }
        
        const totalSub = Math.ceil(shard.length / MAX_QR_BYTES);
        for (let subIdx = 0; subIdx < totalSub; subIdx++) {
            const start = subIdx * MAX_QR_BYTES;
            const end = Math.min(start + MAX_QR_BYTES, shard.length);
            const subPayload = shard.slice(start, end);

            try {
                const payload = btoa(String.fromCharCode(...subPayload));
                frames.push({
                    sessionId,
                    shardIndex: idx,
                    subIndex: subIdx,
                    totalSub,
                    K,
                    N,
                    originalSize,
                    fileName: file.name, // ファイル名を追加
                    payload
                });
            } catch (e) {
                console.error(`base64エンコードエラー (シャード ${idx}, サブ ${subIdx}):`, e);
                // より安全なbase64エンコード
                const payload = btoa(Array.from(subPayload, byte => String.fromCharCode(byte)).join(''));
                frames.push({
                    sessionId,
                    shardIndex: idx,
                    subIndex: subIdx,
                    totalSub,
                    K,
                    N,
                    originalSize,
                    fileName: file.name, // ファイル名を追加
                    payload
                });
            }
        }
    }

    status.textContent = `送信フレーム総数: ${frames.length}`;
    
    // 最初の数フレームの情報を出力
    console.log('最初の5フレーム:');
    for (let i = 0; i < Math.min(5, frames.length); i++) {
        console.log(`フレーム ${i}:`, {
            shardIndex: frames[i].shardIndex,
            subIndex: frames[i].subIndex,
            totalSub: frames[i].totalSub,
            payloadLength: frames[i].payload.length
        });
    }

    // === 事前にすべてのQRコード画像を生成してキャッシュ ===
    status.textContent = 'QRコード画像を生成中...';
    console.log('=== QRコード画像を事前生成してキャッシュします ===');
    
    const qrImageCache = [];
    const tempCanvas = document.createElement('canvas');
    const maxWidth = Math.min(800, window.innerWidth * 0.9);
    const maxHeight = Math.min(800, window.innerHeight * 0.8);
    tempCanvas.width = maxWidth;
    tempCanvas.height = maxHeight;
    const optimalScale = Math.max(3, Math.floor(maxWidth / 120));
    
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const json = JSON.stringify(frame);
        
        // 最初の数フレームの詳細をログ
        if (i < 3) {
            console.log(`フレーム ${i} JSON長: ${json.length} bytes`);
        }
        
        try {
            await BWIPJS.toCanvas(tempCanvas, {
                bcid: 'qrcode',
                text: json,
                scale: optimalScale,
                includetext: false,
                paddingwidth: 5,
                eclevel: 'M',
                paddingheight: 5
            });
            
            // Canvas内容をImageDataとして保存
            const ctx = tempCanvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            qrImageCache.push(imageData);
            
            if (i < 3) {
                console.log(`フレーム ${i} QRコード生成成功 (ImageData: ${imageData.width}x${imageData.height})`);
            }
            
            if ((i + 1) % 50 === 0 || i === frames.length - 1) {
                status.textContent = `QRコード生成中 ${i + 1}/${frames.length}`;
                console.log(`QRコード生成: ${i + 1}/${frames.length}`);
            }
        } catch (e) {
            console.error(`QRコード生成エラー (フレーム ${i}, JSON長=${json.length}):`, e);
            qrImageCache.push(null);
        }
    }
    
    console.log(`=== ${qrImageCache.length} 個のQRコード画像をキャッシュしました ===`);
    
    // メモリ使用量をログ
    if (performance && performance.memory) {
        const memMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
        console.log(`キャッシュ後のメモリ使用量: ${memMB} MB`);
    }

    // 連続描画
    let frameIdx = 0;
    let loopCount = 0;
    const maxLoops = 10; // キャッシュがあるので10周に戻す
    const intervalMs = 1000; // 1秒に延長（より確実な読み取りのため）
    
    // 最初に3秒待機（カメラ準備のため）
    status.textContent = '3秒後に送信開始します...';
    await new Promise(resolve => setTimeout(resolve, 3000));

    const showNext = async () => {
        if (frameIdx >= frames.length) {
            loopCount++;
            if (loopCount >= maxLoops) {
                status.textContent = `送信完了 (${maxLoops}周) - 再送信するにはリロードしてください`;
                console.log(`=== ${maxLoops}周完了。メモリ節約のため停止しました ===`);
                return;
            }
            status.textContent = `送信${loopCount}周完了 - 繰り返します (${loopCount}/${maxLoops})`;
            
            // メモリ使用量をログ
            if (performance && performance.memory) {
                const memMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
                const limitMB = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(1);
                console.log(`=== メモリ使用量: ${memMB} MB / ${limitMB} MB ===`);
            }
            
            // 最初に戻って繰り返し送信
            frameIdx = 0;
            console.log(`=== フレーム送信を最初から繰り返します (${loopCount}周目) ===`);
            
            // キャンバスをクリア
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // メモリ解放のヒント
            if (typeof gc !== 'undefined') {
                gc();
            }
            
            setTimeout(showNext, 3000); // 3秒待ってから再開（メモリ解放の時間）
            return;
        }

        const frame = frames[frameIdx];
        const cachedImage = qrImageCache[frameIdx];
        
        if (!frame) {
            console.error(`フレーム ${frameIdx} が undefined です`);
            frameIdx++;
            setTimeout(showNext, intervalMs);
            return;
        }
        
        if (!cachedImage) {
            console.error(`フレーム ${frameIdx} のキャッシュが null です！`);
        }
        
        // メモリ使用量をログ（可能な場合）
        if (frameIdx % 50 === 0 && performance && performance.memory) {
            const memMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
            console.log(`[メモリ] ${memMB} MB 使用中`);
        }
        
        // 最初の10フレームと100フレームごとに詳細ログ
        if (frameIdx < 10 || frameIdx % 100 === 0) {
            console.log(`[送信 ${frameIdx + 1}/${frames.length}] シャード${frame.shardIndex}, サブ${frame.subIndex}, ループ${loopCount + 1}`);
        }

        // Canvasコンテキストを取得（再利用）
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        
        try {
            // キャッシュした画像を使用（再生成不要！）
            if (cachedImage) {
                ctx.putImageData(cachedImage, 0, 0);
            } else {
                // キャッシュがない場合のフォールバック
                console.warn(`⚠️ フレーム ${frameIdx} のキャッシュがありません`);
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#f00';
                ctx.font = '20px monospace';
                ctx.fillText('Cache Missing: Frame ' + frameIdx, 10, 30);
            }
        } catch (e) {
            console.error('画像表示エラー (フレーム ' + frameIdx + '):', e);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#f00';
            ctx.font = '12px monospace';
            ctx.fillText(`Error: ${e.message}`, 10, 20);
        }

        status.textContent = `送信中 ${frameIdx + 1} / ${frames.length} | シャード ${frame.shardIndex}/${frame.K-1}, サブ ${frame.subIndex}/${frame.totalSub-1} (Loop ${loopCount + 1})`;
        frameIdx++;
        
        setTimeout(showNext, intervalMs);
    };

    showNext();
});