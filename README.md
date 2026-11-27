# 👁️ Baseer (بصير) - Backend Service

> AI-Powered Smart Assistant for the Visually Impaired  
> نظام المساعد الذكي للمكفوفين وضعاف البصر

---

## 📌 Project Overview
**Baseer** is a graduation project aimed at empowering blind and visually impaired individuals through real-time assistive technology. The backend service provides APIs for:
- **Speech-to-Text & Voice Interaction** (Egyptian Dialect Support)
- **Document Reading & OCR** with image quality checks
- **QR-Based Indoor Navigation**
- **Obstacle & Scene Description** integration

---

## 🛠️ Tech Stack
- **Framework:** [NestJS](https://nestjs.com/) (TypeScript)
- **Runtime:** Node.js (v22+)
- **Architecture:** Modular Architecture (Domain-driven modules)

---

## 📂 Modules Structure
- `src/modules/auth`: User authentication and role management
- `src/modules/users`: Profile and user preferences
- `src/modules/navigation`: QR-based indoor wayfinding and routing
- `src/modules/ocr`: Document reading, text extraction, and preprocessing
- `src/modules/voice`: Voice command parsing and TTS integration
- `src/modules/tasks`: Processing asynchronous AI tasks

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run start:dev
```

The API will be available at: `http://localhost:3000`

---

## 🎙️ Audio Processing Pipeline (FFmpeg / FFprobe)

The Speech Transcription endpoint (`POST /api/v1/voice/transcribe`) accepts 6 audio formats:
- **WAV** (`audio/wav`)
- **MP3** (`audio/mpeg`)
- **MP4** (`audio/mp4` with audio stream)
- **M4A** (`audio/m4a`)
- **WebM** (`audio/webm` with audio stream)
- **OGG / Ogg Opus** (`audio/ogg`)

### Audio Constraints & Normalization:
- **Maximum File Size:** 5 MB (`VOICE_AUDIO_MAX_BYTES=5242880`)
- **Maximum Duration:** 10 seconds (enforced via FFprobe duration probing)
- **Canonical Output Representation:** All accepted inputs are transcoded to:
  - Codec: **Opus** (`libopus`)
  - Container: **Ogg**
  - Sample Rate: **16,000 Hz** (16 kHz)
  - Channels: **Mono** (multichannel/stereo streams downmixed to 1 channel)

### FFmpeg / FFprobe Runtime Setup:
- **Docker Environments:** The `Dockerfile` automatically installs `ffmpeg` and `ffprobe` in the `base` image via `apt-get install -y --no-install-recommends ffmpeg`.
- **Local Host Execution (Standalone Node.js):**
  - Install FFmpeg on the host or configure executable locations in `.env`:
    ```env
    FFMPEG_PATH=/usr/bin/ffmpeg    # or C:\path\to\ffmpeg.exe
    FFPROBE_PATH=/usr/bin/ffprobe  # or C:\path\to\ffprobe.exe
    AUDIO_PROCESSING_TIMEOUT_MS=8000
    AUDIO_PROCESSING_MAX_CONCURRENT=4
    ```
  - **Graceful Failure:** If FFmpeg/FFprobe binaries are missing when transcription is invoked, the service fails safely returning HTTP 503 (`ERR_SERVICE_UNAVAILABLE`).
