# QR Code File Transfer - Development Guide

## Setup

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
# Build the application
npm run build

# Preview production build
npm run preview
```

## Usage

### Sending Files

1. Open the application in a web browser
2. Click the "Send File" tab
3. Click "Choose File" button and select the file you want to send
4. Click "Start Transmission" button
5. QR codes will be displayed continuously - keep them visible to the receiving device

### Receiving Files

1. Open the application on a mobile device
2. Click the "Receive File" tab
3. Click "Start Camera" to begin scanning
4. Point the camera at the QR codes displayed by the sender
5. The file will automatically download when enough data is received

## Features

- **File Preservation**: Original filename and MIME type are preserved
- **Large File Support**: Files are split into shards for efficient transfer
- **Error Correction**: Built-in redundancy allows file reconstruction even if some frames are missed
- **Progress Tracking**: Real-time progress display on both sender and receiver
- **Single Page Application**: Both sender and receiver functionality in one app

## Technical Details

- **QR Code Display Rate**: 5 FPS (adjustable in Sender.tsx)
- **Chunk Size**: 800 bytes per QR code
- **Redundancy**: 40% redundant shards for error correction
- **Reconstruction Threshold**: Requires 100% of unique shards to reconstruct the file

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with camera access

## Troubleshooting

### Camera Not Starting
- Ensure camera permissions are granted in browser settings
- Use HTTPS or localhost (required for camera access)
- Check if camera is not being used by another application

### File Not Reconstructing
- Ensure all unique shards are received (check progress indicator)
- Try scanning more slowly or from a closer distance
- Increase lighting or adjust camera focus

### QR Codes Not Scanning
- Ensure QR codes are fully visible and in focus
- Adjust display brightness
- Reduce distance between camera and display
- Try different angles
