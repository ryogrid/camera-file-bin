// シンプルな冗長性実装（Reed-Solomon の代替）
export async function encodeShards(buffer, shardSize, parity) {
    const data = new Uint8Array(buffer);
    const originalSize = data.length; // 元のファイルサイズを保持
    const K = Math.ceil(data.length / shardSize);
    const N = K + parity;
    const sessionId = Date.now().toString(36);

    // データシャードを作成
    const shards = [];
    for (let i = 0; i < K; i++) {
        const start = i * shardSize;
        const end = Math.min(start + shardSize, data.length);
        const shard = new Uint8Array(shardSize);
        shard.set(data.slice(start, end));
        shards.push(shard);
    }

    // 冗長シャード（単純複製）を追加
    for (let i = 0; i < parity; i++) {
        const duplicateIndex = i % K;
        shards.push(new Uint8Array(shards[duplicateIndex]));
    }

    return { shards, K, N, sessionId, originalSize };
}
