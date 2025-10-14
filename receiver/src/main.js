import { BrowserMultiFormatReader, NotFoundException, DecodeHintType, BarcodeFormat } from "@zxing/library";
import { decodeShards } from "./decoder.js";

console.log("Receiver script loaded");

const video = document.getElementById("video");
const status = document.getElementById("status");
const sessions = new Map();

// デバッグ表示用の要素
const debugLog = document.getElementById("debug-log");
const totalReadsEl = document.getElementById("total-reads");
const validFramesEl = document.getElementById("valid-frames");
const invalidFramesEl = document.getElementById("invalid-frames");
const progressInfoEl = document.getElementById("progress-info");
const currentFilenameEl = document.getElementById("current-filename");

// デバッグログを画面に追加する関数
const maxDebugLines = 100; // 最大100行まで保持
let debugLines = [];

function addDebugLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✓' : 'ℹ️';
    const line = `[${timestamp}] ${prefix} ${message}`;
    
    debugLines.push(line);
    if (debugLines.length > maxDebugLines) {
        debugLines.shift(); // 古い行を削除
    }
    
    debugLog.textContent = debugLines.join('\n');
    debugLog.scrollTop = debugLog.scrollHeight; // 自動スクロール
    
    // コンソールにも出力
    console.log(message);
}

// 初期ログ
addDebugLog('Receiver script loaded', 'success');

async function startCamera() {
    try {
        addDebugLog('Starting camera...', 'info');
        const codeReader = new BrowserMultiFormatReader();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await video.play();
        addDebugLog('Camera started successfully', 'success');

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
        addDebugLog('QR Code decoder initialized', 'info');
        
        let decodeCount = 0;
        let validFrameCount = 0;
        let invalidCount = 0;
        let lastLogTime = 0;
        let lastInvalidText = '';
        let sameInvalidCount = 0;
        let lastValidFrameKey = '';
        let sameValidCount = 0;
        
        codeReader.decodeFromVideoDevice(undefined, video, (result, err) => {
            if (result) {
                decodeCount++;
                const text = result.getText();
                const now = Date.now();
                
                // UI更新
                totalReadsEl.textContent = decodeCount;
                validFramesEl.textContent = validFrameCount;
                invalidFramesEl.textContent = invalidCount;
                
                // Log stats every 5 seconds
                if (now - lastLogTime > 5000) {
                    addDebugLog(`Stats: ${decodeCount} reads, ${validFrameCount} valid, ${invalidCount} invalid`, 'info');
                    lastLogTime = now;
                }
                
                // Detect if we're stuck on the same invalid data
                if (text === lastInvalidText) {
                    sameInvalidCount++;
                    if (sameInvalidCount > 10) {
                        // Skip logging after 10 times, but continue processing
                        // Don't return here - we still need to process the frame
                    }
                } else {
                    sameInvalidCount = 0;
                    lastInvalidText = '';
                }
                
                // Log what we're reading (only occasionally)
                if (sameInvalidCount <= 2) {
                    if (text.length < 100) {
                        addDebugLog('Read (' + text.length + ' chars): ' + text, 'info');
                    } else {
                        addDebugLog('Read (' + text.length + ' chars): ' + text.substring(0, 50) + '...', 'info');
                    }
                }
                
                try {
                    const parsed = JSON.parse(text);
                    
                    if (typeof parsed !== 'object' || parsed === null) {
                        invalidCount++;
                        if (text !== lastInvalidText || sameInvalidCount <= 1) {
                            addDebugLog('Not an object: ' + typeof parsed, 'error');
                        }
                        lastInvalidText = text;
                        invalidFramesEl.textContent = invalidCount;
                        // Don't return - continue to next frame
                    } else if (!parsed.sessionId) {
                        invalidCount++;
                        if (text !== lastInvalidText || sameInvalidCount <= 1) {
                            addDebugLog('Missing sessionId. Keys: ' + Object.keys(parsed).join(', '), 'error');
                        }
                        lastInvalidText = text;
                        invalidFramesEl.textContent = invalidCount;
                        // Don't return - continue to next frame
                    } else {
                        // Valid frame!
                        lastInvalidText = '';
                        sameInvalidCount = 0;
                        
                        // 同じフレームを繰り返し読み取っているかチェック
                        const currentFrameKey = parsed.shardIndex + '-' + parsed.subIndex;
                        if (currentFrameKey === lastValidFrameKey) {
                            sameValidCount++;
                            if (sameValidCount === 10) {
                                addDebugLog('⚠️ 同じフレーム (' + currentFrameKey + ') を10回読み取り - 送信側が停止?', 'warn');
                            }
                        } else {
                            if (sameValidCount > 5) {
                                addDebugLog('前フレーム (' + lastValidFrameKey + ') を ' + sameValidCount + ' 回読取', 'info');
                            }
                            sameValidCount = 0;
                            lastValidFrameKey = currentFrameKey;
                        }
                        
                        validFrameCount++;
                        validFramesEl.textContent = validFrameCount;
                        
                        if (validFrameCount <= 10) {
                            addDebugLog('Valid #' + validFrameCount + ': shard=' + parsed.shardIndex + '/' + (parsed.N - 1) + 
                                        ', sub=' + parsed.subIndex + '/' + (parsed.totalSub - 1), 'success');
                        } else if (validFrameCount % 20 === 0) {
                            addDebugLog('Valid frame #' + validFrameCount, 'success');
                        }
                        handleFrame(parsed);
                    }
                } catch (error) {
                    invalidCount++;
                    invalidFramesEl.textContent = invalidCount;
                    if (text !== lastInvalidText || sameInvalidCount <= 1) {
                        addDebugLog('Parse error: ' + error.message, 'error');
                    }
                    lastInvalidText = text;
                    // Don't return - continue to next frame
                }
            }
        }, hints);

        status.textContent = "Camera ready";
        addDebugLog('Ready to receive', 'success');
        
    } catch (error) {
        status.textContent = "Error: " + error.message;
        addDebugLog('Error: ' + error.message, 'error');
    }
}

function handleFrame(frame) {
    const sessionId = frame.sessionId;
    
    if (!sessions.has(sessionId)) {
        addDebugLog('=== New session ===', 'success');
        addDebugLog('Need ' + frame.K + ' shards (/' + frame.N + ' total)', 'info');
        addDebugLog('File: ' + frame.fileName + ' (' + frame.originalSize + ' bytes)', 'info');
        
        currentFilenameEl.textContent = frame.fileName;
        
        sessions.set(sessionId, {
            shards: new Map(),
            receivedShards: new Set(),
            K: frame.K,
            N: frame.N,
            originalSize: frame.originalSize,
            fileName: frame.fileName,
            receivedFrames: new Map()
        });
    }
    
    const session = sessions.get(sessionId);
    const frameKey = frame.shardIndex + '-' + frame.subIndex;
    
    // 重複フレームチェック
    if (session.receivedFrames.has(frameKey)) {
        // Already have this frame, but still update UI
        updateProgress(session);
        return;
    }
    
    // 新しいフレームを記録
    session.receivedFrames.set(frameKey, true);
    
    // 最初の10フレームは詳細ログ
    if (session.receivedFrames.size <= 10) {
        addDebugLog('Frame ' + session.receivedFrames.size + ': shard[' + frame.shardIndex + '][' + frame.subIndex + ']', 'info');
    }
    
    if (!session.shards.has(frame.shardIndex)) {
        session.shards.set(frame.shardIndex, new Array(frame.totalSub).fill(null));
    }
    
    const shardArray = session.shards.get(frame.shardIndex);
    const binaryData = atob(frame.payload);
    const uint8Array = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
    }
    shardArray[frame.subIndex] = uint8Array;
    
    // シャードが完成したかチェック
    if (shardArray.every(sub => sub !== null)) {
        const totalLength = shardArray.reduce((sum, sub) => sum + sub.length, 0);
        const completeShard = new Uint8Array(totalLength);
        let offset = 0;
        for (const sub of shardArray) {
            completeShard.set(sub, offset);
            offset += sub.length;
        }
        
        session.shards.set(frame.shardIndex, completeShard);
        session.receivedShards.add(frame.shardIndex);
        
        addDebugLog('✓ Shard ' + frame.shardIndex + ' complete (' + session.receivedShards.size + '/' + session.K + ')', 'success');
        
        if (session.receivedShards.size >= session.K) {
            addDebugLog('=== All shards received! Reconstructing... ===', 'success');
            reconstructFile(session);
            return;
        }
    }
    
    // UI更新
    updateProgress(session);
}

function updateProgress(session) {
    const completed = session.receivedShards.size;
    const progress = Math.round((completed / session.K) * 100);
    const frameCount = session.receivedFrames.size;
    
    // サブシャードの進捗も計算
    let totalSubShards = 0;
    let receivedSubShards = 0;
    session.shards.forEach((shardData, shardIndex) => {
        if (Array.isArray(shardData)) {
            totalSubShards += shardData.length;
            receivedSubShards += shardData.filter(sub => sub !== null).length;
        }
    });
    
    const subProgress = totalSubShards > 0 ? Math.round((receivedSubShards / totalSubShards) * 100) : 0;
    
    const progressText = completed + '/' + session.K + ' shards (' + progress + '%) | Frames: ' + frameCount + ' | Sub: ' + subProgress + '%';
    status.textContent = 'Receiving: ' + progressText;
    progressInfoEl.textContent = progressText;
}

function reconstructFile(session) {
    try {
        addDebugLog('Reconstructing file...', 'info');
        const completedShards = Array.from(session.receivedShards)
            .sort((a, b) => a - b)
            .slice(0, session.K)
            .map(index => session.shards.get(index));
        
        const fileData = decodeShards(completedShards, session.K, session.originalSize);
        
        if (fileData) {
            addDebugLog('File reconstructed: ' + fileData.length + ' bytes', 'success');
            const blob = new Blob([fileData], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement("a");
            a.href = url;
            a.download = session.fileName || "downloaded_file";
            a.click();
            URL.revokeObjectURL(url);
            
            status.textContent = '✓ Complete: ' + session.fileName;
            addDebugLog('✓✓✓ Download started! ✓✓✓', 'success');
        }
    } catch (error) {
        addDebugLog('Reconstruction error: ' + error.message, 'error');
    }
}

startCamera();
