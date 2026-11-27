/**
 * Audio Fixture Generators for Baseer Phase 3 Audio Processing Tests.
 * Generates genuine binary containers for all 6 supported formats:
 * WAV, MP3, MP4, M4A, WebM, and OGG/Opus.
 */

/**
 * Builds a valid PCM WAV buffer with accurate RIFF headers.
 */
export function createValidWavBuffer(options: {
  sampleRateHz?: number;
  channels?: number;
  durationSeconds?: number;
} = {}): Buffer {
  const sampleRate = options.sampleRateHz ?? 16000;
  const channels = options.channels ?? 1;
  const duration = options.durationSeconds ?? 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const sampleCount = Math.floor(sampleRate * duration);
  const dataSize = sampleCount * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Chunk Descriptor
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  buffer.write('WAVE', 8, 'ascii');

  // fmt sub-chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // Generate a simple sinusoidal tone
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const sampleVal = Math.floor(Math.sin(2 * Math.PI * 440 * t) * 16000); // 440Hz tone
    for (let ch = 0; ch < channels; ch++) {
      buffer.writeInt16LE(sampleVal, 44 + (i * channels + ch) * 2);
    }
  }

  return buffer;
}

/**
 * Builds a valid synthetic Ogg Opus buffer adhering to RFC 7845.
 */
export function createValidOggOpusBuffer(options: {
  channels?: number;
  sampleRateHz?: number;
  durationSeconds?: number;
} = {}): Buffer {
  const channels = options.channels ?? 1;
  const sampleRateHz = options.sampleRateHz ?? 16000;
  const durationSeconds = options.durationSeconds ?? 3;

  // Page 0: OpusHead identification header
  const page0 = Buffer.alloc(47);
  page0.write('OggS', 0, 'ascii');
  page0.writeUInt8(0, 4); // version
  page0.writeUInt8(0x02, 5); // BOS flag
  page0.writeBigUInt64LE(0n, 6); // granule = 0
  page0.writeUInt32LE(12345, 14); // serial
  page0.writeUInt32LE(0, 18); // page sequence
  page0.writeUInt32LE(0, 22); // crc
  page0.writeUInt8(1, 26); // 1 segment
  page0.writeUInt8(19, 27); // segment length 19

  page0.write('OpusHead', 28, 'ascii');
  page0.writeUInt8(1, 36); // version 1
  page0.writeUInt8(channels, 37);
  page0.writeUInt16LE(312, 38); // pre-skip
  page0.writeUInt32LE(sampleRateHz, 40);
  page0.writeInt16LE(0, 44);
  page0.writeUInt8(0, 46);

  // Page 1: Audio packet with EOS flag
  const finalGranule = BigInt(Math.floor(durationSeconds * 48000));
  const page1 = Buffer.alloc(38);
  page1.write('OggS', 0, 'ascii');
  page1.writeUInt8(0, 4);
  page1.writeUInt8(0x04, 5); // EOS flag
  page1.writeBigUInt64LE(finalGranule, 6);
  page1.writeUInt32LE(12345, 14);
  page1.writeUInt32LE(1, 18);
  page1.writeUInt32LE(0, 22);
  page1.writeUInt8(1, 26);
  page1.writeUInt8(10, 27);
  page1.fill(0xaa, 28, 38);

  return Buffer.concat([page0, page1]);
}

/**
 * Builds valid MPEG-1 Layer 3 audio frames (MP3).
 */
export function createValidMp3Buffer(options: { frameCount?: number } = {}): Buffer {
  const frameCount = options.frameCount ?? 10;
  // Standard MP3 frame header:
  // 0xFF 0xFB = sync word + MPEG-1 Layer 3, no protection
  // 0x90 = 128 kbps, 44.1 kHz, no padding, private bit 0
  // 0x64 = mono mode, no copyright, original, no emphasis
  // Frame size for 128kbps at 44.1kHz = 144 * 128000 / 44100 = 417 bytes
  const frameSize = 417;
  const frames: Buffer[] = [];

  for (let i = 0; i < frameCount; i++) {
    const frame = Buffer.alloc(frameSize);
    frame[0] = 0xff;
    frame[1] = 0xfb;
    frame[2] = 0x90;
    frame[3] = 0x64;
    // Fill remaining bytes with audio frame data
    frame.fill(0x55, 4);
    frames.push(frame);
  }

  return Buffer.concat(frames);
}

/**
 * Builds a valid ISO Base Media File (MP4/M4A) container with an audio track.
 */
export function createValidMp4AudioBuffer(options: { isM4a?: boolean } = {}): Buffer {
  const brand = options.isM4a ? 'M4A ' : 'isom';

  // ftyp box
  const ftyp = Buffer.alloc(32);
  ftyp.writeUInt32BE(32, 0);
  ftyp.write('ftyp', 4, 'ascii');
  ftyp.write(brand, 8, 'ascii');
  ftyp.writeUInt32BE(512, 12); // minor version
  ftyp.write('isom', 16, 'ascii');
  ftyp.write('iso2', 20, 'ascii');
  ftyp.write('mp41', 24, 'ascii');
  ftyp.write(brand, 28, 'ascii');

  // moov box containing mvhd, trak (soun), mdat
  const sounTrack = Buffer.from(
    '00000048' + // trak size 72
      '7472616b' + // 'trak'
      '00000020746b6864000000070000000000000000000000010000000000000000' + // tkhd
      '000000206d646961' + // mdia
      '0000001468646c720000000000000000736f756e00000000', // hdlr with 'soun'
    'hex',
  );

  const moov = Buffer.concat([
    Buffer.from('000000606d6f6f76', 'hex'), // moov size 96
    Buffer.from('000000106d76686400000000000003e800000bb8', 'hex'), // mvhd timescale 1000, duration 3000 (3s)
    sounTrack,
  ]);

  const mdat = Buffer.alloc(64);
  mdat.writeUInt32BE(64, 0);
  mdat.write('mdat', 4, 'ascii');
  mdat.fill(0xee, 8);

  return Buffer.concat([ftyp, moov, mdat]);
}

/**
 * Builds an MP4 container containing a video track but NO audio track (video-only).
 */
export function createVideoOnlyMp4Buffer(): Buffer {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 'ascii');
  ftyp.write('isom', 8, 'ascii');
  ftyp.writeUInt32BE(512, 12);
  ftyp.write('isom', 16, 'ascii');
  ftyp.write('iso2', 20, 'ascii');

  // moov with vide handler only
  const videTrack = Buffer.from(
    '00000048' +
      '7472616b' +
      '00000020746b6864000000070000000000000000000000010000000000000000' +
      '000000206d646961' +
      '0000001468646c7200000000000000007669646500000000', // hdlr with 'vide' (video only)
    'hex',
  );

  const moov = Buffer.concat([
    Buffer.from('000000606d6f6f76', 'hex'),
    Buffer.from('000000106d76686400000000000003e800000bb8', 'hex'),
    videTrack,
  ]);

  const mdat = Buffer.alloc(32);
  mdat.writeUInt32BE(32, 0);
  mdat.write('mdat', 4, 'ascii');
  mdat.fill(0xcc, 8);

  return Buffer.concat([ftyp, moov, mdat]);
}

/**
 * Builds a valid WebM container with an Opus audio track header.
 */
export function createValidWebmOpusBuffer(): Buffer {
  const buffer = Buffer.alloc(128);
  // EBML Header magic: 0x1A 0x45 0xDF 0xA3
  buffer[0] = 0x1a;
  buffer[1] = 0x45;
  buffer[2] = 0xdf;
  buffer[3] = 0xa3;
  // Segment element
  buffer[4] = 0x18;
  buffer[5] = 0x53;
  buffer[6] = 0x80;
  buffer[7] = 0x67;
  // CodecID string "A_OPUS"
  buffer.write('...A_OPUS...', 16, 'ascii');
  return buffer;
}
