import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { splitFileIntoShards, type Shard } from '../utils/fileUtils'

const FPS = 2 // Frames per second for QR code display (reduced for better scan reliability)

function Sender() {
  const [file, setFile] = useState<File | null>(null)
  const [shards, setShards] = useState<Shard[]>([])
  const [currentShardIndex, setCurrentShardIndex] = useState(0)
  const [isTransmitting, setIsTransmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const intervalRef = useRef<number | null>(null)

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setShards([])
      setCurrentShardIndex(0)
      setIsTransmitting(false)
      setProgress(0)
    }
  }

  // Start transmission
  const handleStartTransmission = async () => {
    if (!file) return

    try {
      console.log('Starting file transmission:', file.name, file.size, 'bytes')
      const fileShards = await splitFileIntoShards(file)
      console.log(`Created ${fileShards.length} shards (${fileShards[0].metadata.totalShards} original + redundancy)`)
      setShards(fileShards)
      setCurrentShardIndex(0)
      setIsTransmitting(true)
      setProgress(0)
    } catch (error) {
      console.error('Error splitting file:', error)
      alert('Failed to process file. Please try again.')
    }
  }

  // Stop transmission
  const handleStopTransmission = () => {
    setIsTransmitting(false)
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  // Auto-advance QR codes
  useEffect(() => {
    if (isTransmitting && shards.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setCurrentShardIndex(prevIndex => {
          const nextIndex = (prevIndex + 1) % shards.length
          setProgress(Math.round(((prevIndex + 1) / shards.length) * 100))
          return nextIndex
        })
      }, 1000 / FPS)

      return () => {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current)
        }
      }
    }
  }, [isTransmitting, shards.length])

  // Generate QR code data
  const getQRData = () => {
    if (shards.length === 0) return ''
    
    const shard = shards[currentShardIndex]
    const qrData = JSON.stringify({
      index: shard.index,
      data: shard.data,
      metadata: shard.metadata
    })
    
    // Debug: Log with frame number to see actual progression
    console.log(`Frame ${currentShardIndex + 1}/${shards.length} - Shard ${shard.index}`, {
      dataLength: shard.data.length,
      qrDataLength: qrData.length
    })
    
    return qrData
  }

  return (
    <div className="sender">
      <h2>Send File via QR Code</h2>
      
      <div className="file-input-section">
        <input
          type="file"
          onChange={handleFileChange}
          disabled={isTransmitting}
          accept="*/*"
        />
        {file && (
          <div className="status">
            <p>Selected file: {file.name}</p>
            <p>Size: {(file.size / 1024).toFixed(2)} KB</p>
          </div>
        )}
      </div>

      <div className="controls">
        {!isTransmitting ? (
          <button
            onClick={handleStartTransmission}
            disabled={!file}
          >
            Start Transmission
          </button>
        ) : (
          <button onClick={handleStopTransmission}>
            Stop Transmission
          </button>
        )}
      </div>

      {isTransmitting && shards.length > 0 && (
        <div className="transmission-display">
          <div className="progress">
            Progress: {progress}% (Frame {currentShardIndex + 1} of {shards.length})
          </div>
          <div className="qr-display">
            <QRCodeSVG
              value={getQRData()}
              size={480}
              level="H"
              includeMargin={true}
            />
          </div>
          <div className="status">
            <p>Transmitting: {file?.name}</p>
            <p>Keep this QR code visible to the camera</p>
            <p>Original shards: {shards[0].metadata.totalShards}</p>
            <p>Total frames (with redundancy): {shards.length}</p>
            <p style={{ color: '#00ff00' }}>✓ Looping - receiver can catch all frames over multiple cycles</p>
          </div>
        </div>
      )}

      {!isTransmitting && !file && (
        <div className="status">
          <p>Please select a file to begin transmission</p>
        </div>
      )}
    </div>
  )
}

export default Sender
