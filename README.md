# camera-file-bin (QR Code File Transfer)

## Overview
A Proof of Concept (PoC) for transferring files by continuously displaying QR code images in a browser and capturing them with a smartphone camera for reconstruction.  
Simple redundancy functionality allows file reconstruction even if some frames are missed.

## Features
- Preserves original filename for download
- Fast data transfer using QR code format
- Support for large files through shard splitting
- Error correction via redundancy (40% redundancy, recoverable with 60% of shards)
- Both sender and receiver functionality provided in a single Single Page Application (SPA)
- Tab switching to toggle between send/receive functions

## Technology Stack
- Frontend: React, TypeScript
- QR Code Generation: qrcode.react
- File Splitting & Redundancy: Custom implementation
- Build Tool: Vite
- QR Code Reading: html5-qrcode

## Setup

### Requirements
- Node.js 18 or higher
- npm

### Installation
```bash
npm install
```

### Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Build
```bash
npm run build
npm run preview
```

## Usage

### Sending Files
1. Open the web app in a browser
2. Select the "Send File" tab
3. Click the "Choose File" button to select the file you want to send
4. Click "Start Transmission" to continuously display QR code images (5 FPS)
5. Point the receiver device's camera at the QR codes

### Receiving Files
1. Open the web app on a smartphone
2. Select the "Receive File" tab
3. Click "Start Camera" to activate the camera
4. Capture the QR code images with the smartphone camera
5. The file will be automatically reconstructed and downloaded once all required shards are collected

## Technical Specifications
- **QR Code Display Rate**: 5 FPS (adjustable in Sender.tsx)
- **Chunk Size**: 800 bytes/QR code
- **Redundancy**: 40% redundant shards
- **Reconstruction Threshold**: Recoverable with 100% of unique shards

## Browser Compatibility
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with camera access

## Troubleshooting
For details, see [DEVELOPMENT.md](./DEVELOPMENT.md).