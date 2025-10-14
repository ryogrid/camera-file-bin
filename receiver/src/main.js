import { BrowserMultiFormatReader, NotFoundException, DecodeHintType, BarcodeFormat } from "@zxing/library";
import { decodeShards } from "./decoder.js";

console.log("Receiver script loaded");

const video = document.getElementById("video");
const status = document.getElementById("status");
const sessions = new Map();

async function startCamera() {
    try {
        const codeReader = new BrowserMultiFormatReader();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await video.play();

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX]);
        
        let decodeCount = 0;
        let validFrameCount = 0;
        let invalidCount = 0;
        let lastLogTime = 0;
        let lastInvalidText = '';
        let sameInvalidCount = 0;
        
        codeReader.decodeFromVideoDevice(undefined, video, (result, err) => {
            if (result) {
                decodeCount++;
                const text = result.getText();
                const now = Date.now();
                
                // Log stats every 5 seconds
                if (now - lastLogTime > 5000) {
                    console.log('Stats: ' + decodeCount + ' reads, ' + validFrameCount + ' valid, ' + invalidCount + ' invalid');
                    lastLogTime = now;
                }
                
                // Detect if we're stuck on the same invalid data
                if (text === lastInvalidText) {
                    sameInvalidCount++;
                    if (sameInvalidCount > 5) {
                        // Skip logging after 5 times
                        return;
                    }
                } else {
                    sameInvalidCount = 0;
                    lastInvalidText = '';
                }
                
                // Log short reads (likely errors)
                if (text.length < 50) {
                    if (sameInvalidCount <= 5) {
                        console.log('Short read (' + text.length + ' chars): ' + text);
                    }
                }
                
                try {
                    const parsed = JSON.parse(text);
                    
                    if (typeof parsed !== 'object' || parsed === null || !parsed.sessionId) {
                        invalidCount++;
                        lastInvalidText = text;
                        if (sameInvalidCount <= 1) {
                            console.log('Invalid frame type: ' + typeof parsed);
                        }
                        return;
                    }
                    
                    // Reset invalid tracking on valid frame
                    lastInvalidText = '';
                    sameInvalidCount = 0;
                    
                    validFrameCount++;
                    console.log('Valid frame: shard ' + parsed.shardIndex + ', sub ' + parsed.subIndex);
                    handleFrame(parsed);
                } catch (error) {
                    invalidCount++;
                    lastInvalidText = text;
                    if (sameInvalidCount <= 1) {
                        console.log('Parse error: ' + error.message);
                    }
                }
            }
        }, hints);

        status.textContent = "Camera ready";
        
    } catch (error) {
        status.textContent = "Error: " + error.message;
    }
}

function handleFrame(frame) {
    const sessionId = frame.sessionId;
    
    if (!sessions.has(sessionId)) {
        console.log('New session: ' + sessionId + ' (need ' + frame.K + ' shards)');
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
    
    if (session.receivedFrames.has(frameKey)) {
        return;
    }
    session.receivedFrames.set(frameKey, true);
    
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
        
        console.log('Shard ' + frame.shardIndex + ' complete (' + session.receivedShards.size + '/' + session.K + ')');
        
        if (session.receivedShards.size >= session.K) {
            console.log('All shards received!');
            reconstructFile(session);
        }
    }
    
    const completed = session.receivedShards.size;
    const progress = Math.round((completed / session.K) * 100);
    const frameCount = session.receivedFrames.size;
    status.textContent = 'Receiving: ' + completed + '/' + session.K + ' shards (' + progress + '%) | ' + frameCount + ' frames';
}

function reconstructFile(session) {
    try {
        const completedShards = Array.from(session.receivedShards)
            .sort((a, b) => a - b)
            .slice(0, session.K)
            .map(index => session.shards.get(index));
        
        const fileData = decodeShards(completedShards, session.K, session.originalSize);
        
        if (fileData) {
            const blob = new Blob([fileData], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement("a");
            a.href = url;
            a.download = session.fileName || "downloaded_file";
            a.click();
            URL.revokeObjectURL(url);
            
            status.textContent = 'Complete: ' + session.fileName;
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

startCamera();
