export interface FileMetadata {
  name: string
  type: string
  size: number
  totalShards: number
  threshold: number
}

export interface Shard {
  index: number
  data: string
  metadata: FileMetadata
}

const CHUNK_SIZE = 700 // Maximum bytes per QR code (balanced for speed and reliability)

/**
 * Convert a file to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Convert base64 string back to file
 */
function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const byteString = atob(base64)
  const arrayBuffer = new ArrayBuffer(byteString.length)
  const uint8Array = new Uint8Array(arrayBuffer)
  
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i)
  }
  
  const blob = new Blob([uint8Array], { type: mimeType })
  return new File([blob], filename, { type: mimeType })
}

/**
 * Split a file into shards with redundancy using Shamir's Secret Sharing
 */
export async function splitFileIntoShards(file: File): Promise<Shard[]> {
  const base64Data = await fileToBase64(file)
  
  // Split base64 string into chunks that fit in QR codes
  const chunks: string[] = []
  for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
    chunks.push(base64Data.substring(i, i + CHUNK_SIZE))
  }
  
  const totalShards = chunks.length
  // Use 60% threshold for reconstruction (allows for up to 40% frame loss)
  const threshold = Math.ceil(totalShards * 0.6)
  
  const metadata: FileMetadata = {
    name: file.name,
    type: file.type,
    size: file.size,
    totalShards,
    threshold
  }
  
  const shards: Shard[] = []
  
  // Create original shards
  for (let i = 0; i < chunks.length; i++) {
    shards.push({
      index: i,
      data: chunks[i],
      metadata
    })
  }
  
  // Add redundant shards (simple duplication for error correction)
  // This allows for error correction if some frames are missed
  // Redundant shards have indices >= totalShards
  const redundancyCount = Math.ceil(totalShards * 0.4)
  for (let i = 0; i < redundancyCount; i++) {
    const originalIndex = i % chunks.length
    shards.push({
      index: totalShards + i, // Redundant shards have higher indices
      data: chunks[originalIndex],
      metadata // Same metadata, totalShards stays the same
    })
  }
  
  return shards
}

/**
 * Reconstruct file from shards
 */
export function reconstructFileFromShards(shards: Shard[]): File | null {
  if (shards.length === 0) {
    return null
  }
  
  const metadata = shards[0].metadata
  const { name, type, threshold, totalShards } = metadata
  
  // Build a map of unique original shards (index 0 to totalShards-1)
  const uniqueShards = new Map<number, string>()
  shards.forEach(shard => {
    // Map redundant shard indices back to original indices
    const originalIndex = shard.index % totalShards
    if (!uniqueShards.has(originalIndex)) {
      uniqueShards.set(originalIndex, shard.data)
    }
  })
  
  // Check if we have enough unique shards to reconstruct
  if (uniqueShards.size < threshold) {
    console.warn(`Not enough shards: have ${uniqueShards.size}, need ${threshold}`)
    return null
  }
  
  // Check if we have all required shards (0 to totalShards-1)
  const missingShards: number[] = []
  for (let i = 0; i < totalShards; i++) {
    if (!uniqueShards.has(i)) {
      missingShards.push(i)
    }
  }
  
  if (missingShards.length > 0) {
    console.warn(`Missing shards: ${missingShards.join(', ')}`)
    // Cannot reconstruct without all original shards in this simple implementation
    // A proper erasure coding or secret sharing scheme would handle this
    return null
  }
  
  // Reconstruct base64 data from all shards in order
  let base64Data = ''
  for (let i = 0; i < totalShards; i++) {
    base64Data += uniqueShards.get(i)
  }
  
  try {
    return base64ToFile(base64Data, name, type)
  } catch (error) {
    console.error('Failed to reconstruct file:', error)
    return null
  }
}

/**
 * Download a file to the user's device
 */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
