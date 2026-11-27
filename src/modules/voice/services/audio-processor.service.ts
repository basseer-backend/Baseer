import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';

export interface AudioProbeResult {
  formatName: string;
  durationSeconds: number;
  codecName: string;
  sampleRateHz: number;
  channels: number;
  hasAudioStream: boolean;
  hasVideoStream: boolean;
}

export interface NormalizedAudioResult {
  buffer: Buffer;
  mimeType: 'audio/ogg';
  format: 'ogg/opus';
  durationSeconds: number;
  sampleRateHz: 16000;
  channels: 1;
  codec: 'opus';
}

/**
 * Concurrency limiter to bound parallel FFmpeg / FFprobe process execution.
 */
class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueueSize: number = maxConcurrent * 4,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueueSize) {
        throw new AppException(
          AppErrorCode.TOO_MANY_REQUESTS,
          'Audio processing capacity reached: processing queue is full, please retry shortly',
        );
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * Dedicated service for probing, validating, and normalizing uploaded audio
 * using native FFprobe and FFmpeg process execution.
 *
 * Supported Input Formats:
 * 1. WAV
 * 2. MP3
 * 3. MP4 (with audio stream)
 * 4. M4A
 * 5. WebM (with audio stream)
 * 6. OGG / Ogg Opus
 *
 * Normalized Canonical Output:
 * - Codec: Opus
 * - Container: Ogg
 * - Sample Rate: 16,000 Hz
 * - Channels: Mono (1 channel)
 * - Maximum Duration: 10 seconds
 */
@Injectable()
export class AudioProcessorService {
  private readonly logger = new Logger(AudioProcessorService.name);
  private readonly limiter: ConcurrencyLimiter;
  private readonly tempDir: string;

  public static readonly MAX_DURATION_SECONDS = 10;
  public static readonly APPROVED_SAMPLE_RATE_HZ = 16000;
  public static readonly APPROVED_CHANNEL_COUNT = 1;
  public static readonly APPROVED_OUTPUT_CODEC = 'opus';

  // Recognized input container format tokens reported by FFprobe
  private static readonly SUPPORTED_CONTAINERS = [
    'wav',
    'mp3',
    'mov,mp4,m4a,3gp,3g2,mj2',
    'matroska,webm',
    'ogg',
  ];

  constructor(@Optional() private readonly configService?: ConfigService) {
    const maxConcurrent = this.getConfigNumber(
      'AUDIO_PROCESSING_MAX_CONCURRENT',
      4,
    );
    this.limiter = new ConcurrencyLimiter(maxConcurrent);
    this.tempDir = path.join(os.tmpdir(), 'baseer-audio-processor');

    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to initialize dedicated temp directory at ${this.tempDir}: ${err.message}`,
      );
    }
  }

  /**
   * Main entrypoint: Probes, validates constraints, and normalizes input audio to canonical Ogg Opus (16kHz, mono, <=10s).
   */
  async processAndNormalizeAudio(
    audioBuffer: Buffer,
    originalName?: string,
    clientMimeType?: string,
  ): Promise<NormalizedAudioResult> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Audio buffer is required and cannot be empty',
      );
    }

    const fileId = crypto.randomUUID();
    const safeExt = this.sanitizeExtension(originalName, clientMimeType);
    const inputFilePath = path.join(this.tempDir, `input-${fileId}${safeExt}`);
    const outputFilePath = path.join(this.tempDir, `norm-${fileId}.ogg`);

    return this.limiter.run(async () => {
      try {
        await fs.promises.writeFile(inputFilePath, audioBuffer);

        // 1. Probe input file to inspect true container and streams
        const probeResult = await this.probeMedia(inputFilePath);

        // 2. Enforce stream presence
        if (!probeResult.hasAudioStream) {
          if (probeResult.hasVideoStream) {
            throw new AppException(
              AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
              'Uploaded file is a video-only container without an audio stream',
            );
          }
          throw new AppException(
            AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
            'Uploaded file contains no valid audio stream',
          );
        }

        // 3. Enforce container format
        this.verifySupportedContainer(probeResult.formatName);

        // 4. Enforce duration limit (max 10 seconds)
        if (
          isNaN(probeResult.durationSeconds) ||
          probeResult.durationSeconds <= 0
        ) {
          throw new AppException(
            AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
            'Unable to determine audio duration from container metadata',
          );
        }

        // Strict duration enforcement: maximum allowed duration is exactly 10.000 seconds
        if (
          probeResult.durationSeconds >
          AudioProcessorService.MAX_DURATION_SECONDS
        ) {
          throw new AppException(
            AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
            `Audio duration exceeds maximum limit of ${AudioProcessorService.MAX_DURATION_SECONDS} seconds (detected: ${probeResult.durationSeconds.toFixed(3)}s)`,
          );
        }

        // 5. Execute FFmpeg normalization to canonical Ogg Opus (16 kHz, Mono, <= 10s)
        await this.normalizeAudio(inputFilePath, outputFilePath);

        // 6. Post-normalization verification: Inspect output file with FFprobe to guarantee compliance
        const outputProbe = await this.probeMedia(outputFilePath);
        this.verifyNormalizedOutput(outputProbe);

        const normalizedBuffer = await fs.promises.readFile(outputFilePath);

        return {
          buffer: normalizedBuffer,
          mimeType: 'audio/ogg',
          format: 'ogg/opus',
          durationSeconds: outputProbe.durationSeconds,
          sampleRateHz: 16000,
          channels: 1,
          codec: 'opus',
        };
      } finally {
        await this.safeUnlink(inputFilePath);
        await this.safeUnlink(outputFilePath);
      }
    });
  }

  /**
   * Probes a media file using ffprobe and extracts container and stream metadata.
   */
  async probeMedia(filePath: string): Promise<AudioProbeResult> {
    const ffprobePath = this.getFfprobePath();
    const timeoutMs = this.getConfigNumber(
      'AUDIO_PROCESSING_TIMEOUT_MS',
      8000,
    );

    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name,size:stream=index,codec_type,codec_name,sample_rate,channels,duration',
      '-of',
      'json',
      filePath,
    ];

    const result = await this.executeProcess(ffprobePath, args, timeoutMs);

    if (result.exitCode !== 0) {
      this.logger.warn(
        `FFprobe failed with exit code ${result.exitCode} on ${path.basename(filePath)}: ${result.stderr}`,
      );
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Unsupported or corrupted audio file: unable to probe container format',
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Malformed metadata response from audio probe',
      );
    }

    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const format = parsed.format || {};

    const audioStreams = streams.filter((s: any) => s.codec_type === 'audio');
    const videoStreams = streams.filter((s: any) => s.codec_type === 'video');

    const primaryAudio = audioStreams[0];

    let duration = NaN;
    if (primaryAudio?.duration && !isNaN(parseFloat(primaryAudio.duration))) {
      duration = parseFloat(primaryAudio.duration);
    } else if (format.duration && !isNaN(parseFloat(format.duration))) {
      duration = parseFloat(format.duration);
    }

    return {
      formatName: format.format_name || '',
      durationSeconds: duration,
      codecName: primaryAudio?.codec_name || '',
      sampleRateHz: primaryAudio?.sample_rate
        ? parseInt(primaryAudio.sample_rate, 10)
        : 0,
      channels: primaryAudio?.channels || 0,
      hasAudioStream: audioStreams.length > 0,
      hasVideoStream: videoStreams.length > 0,
    };
  }

  /**
   * Normalizes any supported input audio into canonical Ogg Opus (16kHz, mono, max 10s).
   */
  async normalizeAudio(
    inputFilePath: string,
    outputFilePath: string,
  ): Promise<void> {
    const ffmpegPath = this.getFfmpegPath();
    const timeoutMs = this.getConfigNumber(
      'AUDIO_PROCESSING_TIMEOUT_MS',
      8000,
    );

    // Command arguments:
    // -y: overwrite output
    // -v error: quiet
    // -i inputFilePath: input
    // -vn: discard video streams (for MP4/WebM with video tracks)
    // -t 10: hard cutoff at 10 seconds
    // -c:a libopus: encode to Opus
    // -ar 16000: resample to 16 kHz
    // -ac 1: downmix to mono (1 channel)
    // -b:a 32k: 32 kbps bitrate (optimal for speech recognition)
    const args = [
      '-y',
      '-v',
      'error',
      '-i',
      inputFilePath,
      '-vn',
      '-t',
      '10',
      '-c:a',
      'libopus',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-b:a',
      '32k',
      outputFilePath,
    ];

    const result = await this.executeProcess(ffmpegPath, args, timeoutMs);

    if (result.exitCode !== 0) {
      this.logger.error(
        `FFmpeg normalization failed [exit code ${result.exitCode}]: ${result.stderr}`,
      );
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Audio normalization failed: could not transcode media to canonical Opus format',
      );
    }
  }

  /**
   * Verifies that the normalized output strictly adheres to all canonical requirements.
   */
  private verifyNormalizedOutput(probe: AudioProbeResult): void {
    if (!probe.hasAudioStream) {
      throw new AppException(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        'Normalized output is missing an audio stream',
      );
    }

    if (!probe.formatName.includes('ogg')) {
      throw new AppException(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        `Normalized container mismatch: expected ogg, got ${probe.formatName}`,
      );
    }

    if (probe.codecName !== AudioProcessorService.APPROVED_OUTPUT_CODEC) {
      throw new AppException(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        `Normalized codec mismatch: expected opus, got ${probe.codecName}`,
      );
    }

    if (probe.sampleRateHz !== AudioProcessorService.APPROVED_SAMPLE_RATE_HZ) {
      throw new AppException(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        `Normalized sample rate mismatch: expected 16000 Hz, got ${probe.sampleRateHz}`,
      );
    }

    if (probe.channels !== AudioProcessorService.APPROVED_CHANNEL_COUNT) {
      throw new AppException(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        `Normalized channel count mismatch: expected mono (1), got ${probe.channels}`,
      );
    }

    if (
      probe.durationSeconds >
      AudioProcessorService.MAX_DURATION_SECONDS
    ) {
      throw new AppException(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        `Normalized duration exceeds limit: ${probe.durationSeconds.toFixed(3)}s`,
      );
    }
  }

  /**
   * Verifies that the probed format matches one of the 6 approved input container families.
   */
  private verifySupportedContainer(formatName: string): void {
    if (!formatName) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Unsupported media format: container could not be identified',
      );
    }

    const formats = formatName.split(',').map((f) => f.trim().toLowerCase());
    const isSupported = formats.some((fmt) =>
      AudioProcessorService.SUPPORTED_CONTAINERS.some((supported) =>
        supported.split(',').includes(fmt),
      ),
    );

    if (!isSupported) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        `Unsupported audio format (${formatName}). Supported formats: WAV, MP3, MP4, M4A, WebM, OGG.`,
      );
    }
  }

  /**
   * Spawns a child process with timeout, bounded output buffers, and safe error mapping.
   */
  public executeProcess(
    executable: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let isDone = false;

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(executable, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          return reject(
            new AppException(
              AppErrorCode.SERVICE_UNAVAILABLE,
              `Audio processing executable not found (${executable}). Please configure FFMPEG_PATH and FFPROBE_PATH.`,
            ),
          );
        }
        return reject(err);
      }

      const timer = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          reject(
            new AppException(
              AppErrorCode.REQUEST_TIMEOUT,
              'Audio processing timed out while probing or transcoding media',
            ),
          );
        }
      }, timeoutMs);

      child.on('error', (err: any) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          if (err?.code === 'ENOENT') {
            reject(
              new AppException(
                AppErrorCode.SERVICE_UNAVAILABLE,
                `Audio processing executable not found (${executable}). Please configure FFMPEG_PATH and FFPROBE_PATH.`,
              ),
            );
          } else {
            reject(err);
          }
        }
      });

      child.stdout?.on('data', (data) => {
        if (stdout.length < 1024 * 1024) {
          stdout += data.toString();
        }
      });

      child.stderr?.on('data', (data) => {
        if (stderr.length < 1024 * 1024) {
          stderr += data.toString();
        }
      });

      child.on('close', (code) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 1,
          });
        }
      });
    });
  }

  private sanitizeExtension(
    originalName?: string,
    clientMimeType?: string,
  ): string {
    if (originalName) {
      const ext = path.extname(originalName).toLowerCase();
      if (/^\.[a-z0-9]{2,5}$/.test(ext)) {
        return ext;
      }
    }

    if (clientMimeType) {
      if (clientMimeType.includes('wav')) return '.wav';
      if (clientMimeType.includes('mpeg') || clientMimeType.includes('mp3'))
        return '.mp3';
      if (clientMimeType.includes('mp4')) return '.mp4';
      if (clientMimeType.includes('m4a')) return '.m4a';
      if (clientMimeType.includes('webm')) return '.webm';
      if (clientMimeType.includes('ogg')) return '.ogg';
    }

    return '.bin';
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // Ignore cleanup error
    }
  }

  private getFfmpegPath(): string {
    return (
      this.configService?.get<string>('FFMPEG_PATH') ||
      process.env.FFMPEG_PATH ||
      'ffmpeg'
    );
  }

  private getFfprobePath(): string {
    return (
      this.configService?.get<string>('FFPROBE_PATH') ||
      process.env.FFPROBE_PATH ||
      'ffprobe'
    );
  }

  private getConfigNumber(key: string, defaultValue: number): number {
    const val = this.configService?.get<string>(key) || process.env[key];
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return defaultValue;
  }
}
