export function decodeShards(shards, K, originalSize) {
    if (shards.length < K) {
        throw new Error('Need at least ' + K + ' shards, but only have ' + shards.length);
    }

    const dataShards = shards.slice(0, K);
    const totalLength = dataShards.reduce((sum, shard) => sum + shard.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const shard of dataShards) {
        result.set(shard, offset);
        offset += shard.length;
    }
    
    if (originalSize && originalSize < result.length) {
        return result.slice(0, originalSize);
    }
    
    return result;
}
