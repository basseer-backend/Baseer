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

---

## 📷 Image Security Pipeline (Sharp)

The Vision and OCR endpoints (`POST /api/v1/ocr/read`, `POST /api/v1/vision/*`) accept Base64-encoded image payloads. To accommodate blind users taking live photos without format confusion, the backend accepts multiple formats and standardizes them before reaching upstream AI models.

### Accepted Input Formats:
Format detection is performed strictly by **magic bytes** (never trusting data-URI prefixes or declared MIME types):
- **JPEG:** `FF D8 FF`
- **PNG:** `89 50 4E 47 0D 0A 1A 0A`
- **WebP:** `RIFF` at bytes 0..3 and `WEBP` at bytes 8..11
- **AVIF:** ISO-BMFF `ftyp` box at bytes 4..7 with major brand `avif` or `avis`

### Canonical Output Representation:
All valid incoming images are normalized to a single canonical standard:
- **Format:** Pure Base64 JPEG (without `data:` prefix)
- **MIME Type:** `image/jpeg`
- **Colourspace:** sRGB
- **Quality:** `IMAGE_JPEG_QUALITY` (default 90)
- **Orientation:** Auto-rotated using EXIF metadata (`.rotate()`)
- **Metadata:** Completely stripped (removes all EXIF, GPS coordinates, IPTC, XMP, and ICC profiles)
- **Transparency:** Flattened onto a solid white background (`#ffffff`) for alpha channels
- **Animated Inputs:** First frame only (`{ page: 0 }` for animated WebP/AVIF)
- *Assumption:* Upstream AI services (OCR, Scene, Currency, Color, Signs, Faces, Obstacles) consume canonical JPEG input images.

### Pipeline Limits & Guardrails:
- **Maximum Decoded Size:** 7 MiB (`IMAGE_MAX_BYTES=7340032`). When Base64-encoded, a 7 MiB image produces ~9.8 MB of payload text, remaining safely below the 10 MB JSON body limit in `src/main.ts`.  
  > ⚠️ **Important:** Raising `IMAGE_MAX_BYTES` above ~7.5 MB requires increasing the NestJS JSON body limit (`json({ limit: '10mb' })`) in `src/main.ts`.
- **Maximum Input Pixels:** 50 Megapixels (`IMAGE_MAX_PIXELS=50000000`), covering modern 48/50 MP smartphone sensors while protecting against decompression bomb attacks (DoS).
- **No Server-Side Downscaling:** Resolution is preserved without resizing to ensure optimal OCR extraction accuracy.

### Unsupported Formats:
- **HEIC / HEIF:** Recognised by ISO-BMFF magic bytes (`ftyp` with brands `heic, heix, hevc, hevx, heim, heis, mif1, msf1`), but rejected with `ERR_UNSUPPORTED_IMAGE_FORMAT` because prebuilt Sharp binaries in Node environments do not bundle patent-restricted HEVC (H.265) decoders.
- **GIF, BMP, TIFF, SVG, PDF, XML, Text:** Rejected with `ERR_UNSUPPORTED_IMAGE_FORMAT`.

### Mobile Team Recommendations:
1. Capture photos directly as JPEG on device, or convert HEIC to JPEG locally before Base64 encoding.
2. Downscale camera captures to approximately **2048 px on the long edge** at **quality ~85** before upload. This results in ~0.5 to 1.5 MB Base64 payloads, ensuring fast network transmission and preventing `ERR_FILE_TOO_LARGE` errors.
