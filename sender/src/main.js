import BWIPJS from 'bwip-js';
import { encodeShards } from './encoder.js';

const fileInput = document.getElementById('file');
const startBtn = document.getElementById('start');
const status = document.getElementById('status');
const canvas = document.getElementById('canvas');

// キャンバスサイズを動的に調整
function adjustCanvasSize() {
    const container = document.querySelector('.canvas-container');
    const maxWidth = Math.min(600, window.innerWidth - 40);  // 大きくした
    const maxHeight = Math.min(600, window.innerHeight * 0.7); // 大きくした
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

    status.textContent = 'Aztec 最大容量計算中...';
    
    // より安全な最大ペイロードサイズを設定（小さくして読み取りやすく）
    const MAX_AZTEC_BYTES = 400; // さらに小さくして確実に
    
    status.textContent = `Aztec 最大ペイロード: ${MAX_AZTEC_BYTES} bytes (固定値)`;

    status.textContent = 'ファイル読み込み中...';
    const arrayBuffer = await file.arrayBuffer();

    status.textContent = 'シャード符号化中...';
    const { shards, K, N, sessionId, originalSize } = await encodeShards(arrayBuffer, shardSize, parity);

    console.log('エンコード結果:', { shardsLength: shards.length, K, N, sessionId, originalSize });
    console.log('各シャードの長さ:', shards.map((s, i) => s ? s.length : 'undefined'));

    // 最初のフレームのJSONサイズをチェック
    const testFrame = {
        sessionId,
        shardIndex: 0,
        subIndex: 0,
        totalSub: 1,
        K,
        N,
        originalSize,
        payload: 'test'
    };
    console.log('テストフレームJSON長:', JSON.stringify(testFrame).length);

    // シャードを Aztec に収まるサブシャードに分割
    const frames = [];
    for (let idx = 0; idx < shards.length; idx++) {
        const shard = shards[idx];
        if (!shard) {
            console.error(`シャード ${idx} が undefined です`);
            continue;
        }
        
        const totalSub = Math.ceil(shard.length / MAX_AZTEC_BYTES);
        for (let subIdx = 0; subIdx < totalSub; subIdx++) {
            const start = subIdx * MAX_AZTEC_BYTES;
            const end = Math.min(start + MAX_AZTEC_BYTES, shard.length);
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

    // 連続描画
    let frameIdx = 0;
    const intervalMs = 1000; // 1秒に延長（より確実な読み取りのため）
    
    // 最初に3秒待機（カメラ準備のため）
    status.textContent = '3秒後に送信開始します...';
    await new Promise(resolve => setTimeout(resolve, 3000));

    const showNext = async () => {
        if (frameIdx >= frames.length) {
            status.textContent = '送信1周完了 - 繰り返します';
            // 最初に戻って繰り返し送信
            frameIdx = 0;
            console.log('=== フレーム送信を最初から繰り返します ===');
            setTimeout(showNext, 2000); // 2秒待ってから再開
            return;
        }

        const frame = frames[frameIdx];
        if (!frame) {
            console.error(`フレーム ${frameIdx} が undefined です`);
            frameIdx++;
            setTimeout(showNext, intervalMs);
            return;
        }

        const json = JSON.stringify(frame);
        console.log(`[送信 ${frameIdx + 1}/${frames.length}] シャード${frame.shardIndex}, サブ${frame.subIndex} (JSON: ${json.length}bytes)`);

        try {
            // canvasサイズに基づいてスケールを計算
            const optimalScale = Math.max(3, Math.floor(canvas.width / 150));
            
            // canvasをクリア
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Data Matrixコードを生成（パブリックドメイン）
            await BWIPJS.toCanvas(canvas, {
                bcid: 'datamatrix',
                text: json,
                scale: optimalScale,
                includetext: false,
                paddingwidth: 5,
                paddingheight: 5
            });
            
            console.log(`送信フレーム ${frameIdx + 1}/${frames.length}: シャード${frame.shardIndex}, サブ${frame.subIndex}`);
        } catch (e) {
            console.error('bwip-js error', e);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000';
            ctx.font = '10px monospace';
            ctx.fillText(`Error: ${e.message}`, 10, 20);
            if (json) {
                ctx.fillText(json.slice(0, 100) + '...', 10, 40);
            }
        }

        status.textContent = `送信中 ${frameIdx + 1} / ${frames.length} | シャード ${frame.shardIndex}/${frame.K-1}, サブ ${frame.subIndex}/${frame.totalSub-1}`;
        frameIdx++;
        setTimeout(showNext, intervalMs);
    };

    showNext();
});