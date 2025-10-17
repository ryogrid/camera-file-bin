import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { reconstructFileFromShards, downloadFile, type Shard } from '../utils/fileUtils'

function Receiver() {
  const [isScanning, setIsScanning] = useState(false)
  const [receivedShards, setReceivedShards] = useState<Map<number, Shard>>(new Map())
  const [progress, setProgress] = useState(0)
  const [totalShards, setTotalShards] = useState(0)
  const [_threshold, setThreshold] = useState(0) // Stored for metadata but not currently used in UI
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('Ready to scan')
  const [hasDownloaded, setHasDownloaded] = useState(false) // Track if file has been downloaded
  const [uniqueShardCount, setUniqueShardCount] = useState(0) // Track unique shards collected
  const [lastScanTime, setLastScanTime] = useState<number>(0) // Track last successful scan for visual feedback
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const scannerInitialized = useRef(false)

  // Start scanning
  const handleStartScanning = async () => {
    try {
      if (!html5QrCodeRef.current && !scannerInitialized.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader')
        scannerInitialized.current = true
      }

      const qrCodeScanner = html5QrCodeRef.current
      if (!qrCodeScanner) return

      await qrCodeScanner.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: 3, // Reduced to match slower sender frame rate
          qrbox: { width: 350, height: 350 }, // Larger scan area for easier targeting
          aspectRatio: 1.0,
          disableFlip: false,
        },
        onScanSuccess,
        onScanError
      )

      setIsScanning(true)
      setStatus('Scanning... Point camera at QR codes')
    } catch (error) {
      console.error('Error starting scanner:', error)
      setStatus('Failed to start camera. Please check permissions.')
    }
  }

  // Stop scanning
  const handleStopScanning = async () => {
    try {
      if (html5QrCodeRef.current && isScanning) {
        await html5QrCodeRef.current.stop()
        setIsScanning(false)
        setStatus('Scanning stopped')
      }
    } catch (error) {
      console.error('Error stopping scanner:', error)
    }
  }

  // Handle successful QR code scan
  const onScanSuccess = (decodedText: string) => {
    // Don't process any more shards if file has already been downloaded
    if (hasDownloaded) {
      return
    }
    
    // Debug: Log when QR code is scanned
    console.log('QR code scanned, length:', decodedText.length)
    
    try {
      const shard: Shard = JSON.parse(decodedText)
      
      console.log('Parsed shard:', { index: shard.index, hasData: !!shard.data, metadata: shard.metadata })
      
      // Validate shard structure
      if (!shard || typeof shard.index !== 'number' || !shard.data || !shard.metadata) {
        console.warn('Invalid shard structure - missing required fields')
        return
      }
      
      // Validate metadata structure
      if (!shard.metadata.name || !shard.metadata.totalShards || !shard.metadata.threshold) {
        console.warn('Invalid shard metadata:', shard.metadata)
        return
      }
      
      console.log('✓ Valid shard received:', shard.index)
      
      // Visual feedback: update last scan time
      setLastScanTime(Date.now())
      
      setReceivedShards(prev => {
        const newMap = new Map(prev)
        
        // Only add if we don't already have this shard
        if (!newMap.has(shard.index)) {
          newMap.set(shard.index, shard)
          
          // Update metadata on first shard
          if (newMap.size === 1) {
            setTotalShards(shard.metadata.totalShards)
            setThreshold(shard.metadata.threshold)
            setFileName(shard.metadata.name)
            console.log('First shard - metadata set:', shard.metadata)
          }
          
          // Calculate progress
          const uniqueOriginalShards = new Set<number>()
          newMap.forEach(s => {
            uniqueOriginalShards.add(s.index % shard.metadata.totalShards)
          })
          
          const progressPercent = Math.round(
            (uniqueOriginalShards.size / shard.metadata.totalShards) * 100
          )
          setProgress(progressPercent)
          setUniqueShardCount(uniqueOriginalShards.size)
          
          console.log(`Progress: ${uniqueOriginalShards.size}/${shard.metadata.totalShards}`)
          
          // Update status
          setStatus(
            `Scanning... ${uniqueOriginalShards.size}/${shard.metadata.totalShards} unique shards (${newMap.size} total frames)`
          )
          
          // Auto-reconstruct when we have all required shards
          if (uniqueOriginalShards.size >= shard.metadata.totalShards) {
            console.log('All shards collected! Reconstructing...')
            reconstructAndDownload(Array.from(newMap.values()))
          }
        } else {
          console.log('Duplicate shard, skipping:', shard.index)
        }
        
        return newMap
      })
    } catch (error) {
      // Log parse errors for debugging
      console.warn('Failed to parse QR code as JSON:', error, 'Data:', decodedText.substring(0, 100))
      return
    }
  }

  // Handle scan error (not critical, QR codes may be temporarily unreadable)
  const onScanError = (_errorMessage: string) => {
    // Silently ignore scan errors as they're expected when QR codes are not perfectly visible
    // These errors occur naturally when the camera can't detect a valid QR code in the frame
    // Uncomment below for debugging:
    // console.debug('Scan error:', _errorMessage)
  }

  // Reconstruct file from received shards
  const reconstructAndDownload = async (shards: Shard[]) => {
    // Prevent multiple downloads
    if (hasDownloaded) {
      return
    }
    
    try {
      setHasDownloaded(true) // Set flag immediately to prevent race conditions
      setStatus('Reconstructing file...')
      await handleStopScanning()
      
      const file = reconstructFileFromShards(shards)
      
      if (file) {
        downloadFile(file)
        setStatus(`File "${file.name}" downloaded successfully! Click Reset to receive another file.`)
      } else {
        setStatus('Failed to reconstruct file. Need more shards.')
        setHasDownloaded(false) // Reset flag if reconstruction failed
      }
    } catch (error) {
      console.error('Error reconstructing file:', error)
      setStatus('Error reconstructing file')
      setHasDownloaded(false) // Reset flag on error
    }
  }

  // Reset receiver state
  const handleReset = () => {
    setReceivedShards(new Map())
    setProgress(0)
    setTotalShards(0)
    setThreshold(0)
    setFileName('')
    setStatus('Ready to scan')
    setHasDownloaded(false) // Reset download flag
    setUniqueShardCount(0) // Reset unique shard count
    setLastScanTime(0) // Reset last scan time
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && isScanning) {
        html5QrCodeRef.current.stop().catch(console.error)
      }
    }
  }, [isScanning])

  // Force re-render for visual feedback animation
  useEffect(() => {
    if (lastScanTime > 0) {
      const timer = setTimeout(() => {
        // Trigger re-render to update border color
        setLastScanTime(lastScanTime)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [lastScanTime])

  return (
    <div className="receiver">
      <h2>Receive File via QR Code</h2>
      
      <div className="controls">
        {!isScanning ? (
          <button onClick={handleStartScanning}>
            Start Camera
          </button>
        ) : (
          <button onClick={handleStopScanning}>
            Stop Camera
          </button>
        )}
        
        {receivedShards.size > 0 && (
          <button onClick={handleReset}>
            Reset
          </button>
        )}
      </div>

      <div className="camera-container">
        <div 
          id="qr-reader"
          style={{
            border: `4px solid ${
              Date.now() - lastScanTime < 300 
                ? '#00ff00' 
                : isScanning 
                  ? '#646cff' 
                  : '#666666'
            }`,
            borderRadius: '8px',
            transition: 'border-color 0.3s ease'
          }}
        ></div>
        {Date.now() - lastScanTime < 300 && (
          <div style={{
            textAlign: 'center',
            color: '#00ff00',
            fontWeight: 'bold',
            marginTop: '0.5rem',
            fontSize: '1.2rem'
          }}>
            ✓ QR Code Read!
          </div>
        )}
      </div>

      <div className="status">
        <p><strong>Status:</strong> {status}</p>
        {fileName && <p><strong>File:</strong> {fileName}</p>}
        {totalShards > 0 && (
          <>
            <p><strong>Progress:</strong> {progress}%</p>
            <p><strong>Unique shards collected:</strong> {uniqueShardCount} / {totalShards}</p>
            <p><strong>Total frames scanned:</strong> {receivedShards.size}</p>
            {uniqueShardCount < totalShards && (
              <p style={{ color: '#ffa500' }}>
                Keep scanning... Need {totalShards - uniqueShardCount} more unique shard(s)
              </p>
            )}
            {uniqueShardCount >= totalShards && !hasDownloaded && (
              <p style={{ color: '#00ff00' }}>
                ✓ All shards collected! Reconstructing file...
              </p>
            )}
          </>
        )}
      </div>

      {!isScanning && receivedShards.size === 0 && (
        <div className="status">
          <p>Click "Start Camera" to begin receiving files</p>
          <p>Point your camera at the QR codes displayed on the sender device</p>
        </div>
      )}
    </div>
  )
}

export default Receiver
