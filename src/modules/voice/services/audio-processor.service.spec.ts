import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AudioProcessorService } from './audio-processor.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';
import {
  createValidWavBuffer,
  createValidOggOpusBuffer,
  createValidMp3Buffer,
  createValidMp4AudioBuffer,
  createVideoOnlyMp4Buffer,
  createValidWebmOpusBuffer,
} from '../fixtures/audio-fixtures';

describe('AudioProcessorService', () => {
  let service: AudioProcessorService;

  beforeEach(() => {
    service = new AudioProcessorService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Input Validation & Edge Cases', () => {
    it('throws ERR_VALIDATION_FAILED when buffer is empty', async () => {
      await expect(
        service.processAndNormalizeAudio(Buffer.alloc(0)),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
    });

    it('throws ERR_VALIDATION_FAILED when buffer is undefined', async () => {
      await expect(
        service.processAndNormalizeAudio(undefined as any),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
    });
  });

  describe('Process Safety & Error Handling', () => {
    it('throws ERR_SERVICE_UNAVAILABLE (503) when FFprobe executable is missing (ENOENT)', async () => {
      vi.spyOn(service, 'executeProcess').mockRejectedValueOnce(
        new AppException(
          AppErrorCode.SERVICE_UNAVAILABLE,
          'Audio processing executable not found (ffprobe)',
        ),
      );

      const wav = createValidWavBuffer();
      await expect(
        service.processAndNormalizeAudio(wav, 'test.wav', 'audio/wav'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.SERVICE_UNAVAILABLE,
      });
    });

    it('throws ERR_SERVICE_UNAVAILABLE (503) when FFmpeg executable is missing (ENOENT)', async () => {
      // First probe succeeds
      vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
        formatName: 'wav',
        durationSeconds: 2.5,
        codecName: 'pcm_s16le',
        sampleRateHz: 16000,
        channels: 1,
        hasAudioStream: true,
        hasVideoStream: false,
      });

      // Normalization fails with missing FFmpeg
      vi.spyOn(service, 'normalizeAudio').mockRejectedValueOnce(
        new AppException(
          AppErrorCode.SERVICE_UNAVAILABLE,
          'Audio processing executable not found (ffmpeg)',
        ),
      );

      const wav = createValidWavBuffer();
      await expect(
        service.processAndNormalizeAudio(wav, 'test.wav', 'audio/wav'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.SERVICE_UNAVAILABLE,
      });
    });

    it('throws ERR_REQUEST_TIMEOUT (504) when processing exceeds timeout', async () => {
      vi.spyOn(service, 'executeProcess').mockRejectedValueOnce(
        new AppException(
          AppErrorCode.REQUEST_TIMEOUT,
          'Audio processing timed out',
        ),
      );

      const wav = createValidWavBuffer();
      await expect(
        service.processAndNormalizeAudio(wav, 'test.wav', 'audio/wav'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.REQUEST_TIMEOUT,
      });
    });

    it('throws ERR_UNSUPPORTED_AUDIO_FORMAT when FFprobe returns non-zero exit code (corrupt/invalid media)', async () => {
      vi.spyOn(service, 'executeProcess').mockResolvedValueOnce({
        stdout: '',
        stderr: 'Invalid data found when processing input',
        exitCode: 1,
      });

      const randomBytes = Buffer.from('not a media file at all');
      await expect(
        service.processAndNormalizeAudio(randomBytes, 'random.wav', 'audio/wav'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      });
    });

    it('throws ERR_UNSUPPORTED_AUDIO_FORMAT when FFprobe returns malformed JSON', async () => {
      vi.spyOn(service, 'executeProcess').mockResolvedValueOnce({
        stdout: 'not valid json',
        stderr: '',
        exitCode: 0,
      });

      const wav = createValidWavBuffer();
      await expect(
        service.processAndNormalizeAudio(wav, 'test.wav', 'audio/wav'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      });
    });

    it('cleans up temporary files on success', async () => {
      const unlinkSpy = vi.spyOn(fs.promises, 'unlink');

      vi.spyOn(service, 'probeMedia')
        .mockResolvedValueOnce({
          formatName: 'wav',
          durationSeconds: 2.0,
          codecName: 'pcm_s16le',
          sampleRateHz: 16000,
          channels: 1,
          hasAudioStream: true,
          hasVideoStream: false,
        })
        .mockResolvedValueOnce({
          formatName: 'ogg',
          durationSeconds: 2.0,
          codecName: 'opus',
          sampleRateHz: 16000,
          channels: 1,
          hasAudioStream: true,
          hasVideoStream: false,
        });

      vi.spyOn(service, 'normalizeAudio').mockImplementationOnce(
        async (_in, out) => {
          await fs.promises.writeFile(out, createValidOggOpusBuffer());
        },
      );

      const wav = createValidWavBuffer();
      const result = await service.processAndNormalizeAudio(
        wav,
        'clean.wav',
        'audio/wav',
      );

      expect(result.format).toBe('ogg/opus');
      expect(unlinkSpy).toHaveBeenCalledTimes(2); // input and output cleaned up
    });

    it('cleans up temporary files on failure', async () => {
      const unlinkSpy = vi.spyOn(fs.promises, 'unlink');

      vi.spyOn(service, 'probeMedia').mockRejectedValueOnce(
        new AppException(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT),
      );

      const wav = createValidWavBuffer();
      await expect(
        service.processAndNormalizeAudio(wav, 'fail.wav', 'audio/wav'),
      ).rejects.toThrow();

      expect(unlinkSpy).toHaveBeenCalled();
    });

    it('prevents shell injection through dangerous filenames', async () => {
      const executeSpy = vi
        .spyOn(service, 'executeProcess')
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            streams: [
              {
                codec_type: 'audio',
                codec_name: 'pcm_s16le',
                sample_rate: '16000',
                channels: 1,
                duration: '2.0',
              },
            ],
            format: { format_name: 'wav', duration: '2.0' },
          }),
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            streams: [
              {
                codec_type: 'audio',
                codec_name: 'opus',
                sample_rate: '16000',
                channels: 1,
                duration: '2.0',
              },
            ],
            format: { format_name: 'ogg', duration: '2.0' },
          }),
          stderr: '',
          exitCode: 0,
        });

      vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(
        createValidOggOpusBuffer(),
      );

      const dangerousName = 'file; rm -rf /; `reboot` & calc.exe.wav';
      const wav = createValidWavBuffer();

      await service.processAndNormalizeAudio(wav, dangerousName, 'audio/wav');

      // Check args passed to executeProcess: no shell commands are passed
      const probeCallArgs = executeSpy.mock.calls[0][1];
      const filePathArg = probeCallArgs[probeCallArgs.length - 1];

      // File path argument must only have safe generated uuid and extension
      expect(filePathArg).not.toContain('rm -rf');
      expect(filePathArg).not.toContain('reboot');
      expect(filePathArg).toContain('.wav');
    });
  });

  describe('Container & Stream Detection', () => {
    it('rejects video-only MP4 containers with ERR_UNSUPPORTED_AUDIO_FORMAT', async () => {
      vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        durationSeconds: 5.0,
        codecName: '',
        sampleRateHz: 0,
        channels: 0,
        hasAudioStream: false,
        hasVideoStream: true,
      });

      const videoMp4 = createVideoOnlyMp4Buffer();
      await expect(
        service.processAndNormalizeAudio(videoMp4, 'video.mp4', 'video/mp4'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        message: expect.stringContaining('video-only'),
      });
    });

    it('rejects containers with no audio stream', async () => {
      vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
        formatName: 'unknown',
        durationSeconds: 0,
        codecName: '',
        sampleRateHz: 0,
        channels: 0,
        hasAudioStream: false,
        hasVideoStream: false,
      });

      const dummy = Buffer.from('data');
      await expect(
        service.processAndNormalizeAudio(dummy, 'empty.bin'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        message: expect.stringContaining('no valid audio stream'),
      });
    });

    it('rejects unsupported container formats (e.g. avi, flv, mkv)', async () => {
      vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
        formatName: 'avi',
        durationSeconds: 3.0,
        codecName: 'pcm_s16le',
        sampleRateHz: 16000,
        channels: 1,
        hasAudioStream: true,
        hasVideoStream: false,
      });

      const dummy = Buffer.from('avi-data');
      await expect(
        service.processAndNormalizeAudio(dummy, 'movie.avi'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        message: expect.stringContaining('Unsupported audio format'),
      });
    });

    it('rejects media when duration cannot be determined (missing or NaN)', async () => {
      vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
        formatName: 'wav',
        durationSeconds: NaN,
        codecName: 'pcm_s16le',
        sampleRateHz: 16000,
        channels: 1,
        hasAudioStream: true,
        hasVideoStream: false,
      });

      const wav = createValidWavBuffer();
      await expect(
        service.processAndNormalizeAudio(wav, 'unknown-dur.wav'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        message: expect.stringContaining('Unable to determine audio duration'),
      });
    });

    describe('Strict Duration Boundary Checks (Section 4.A)', () => {
      it('accepts audio of 9.990 seconds duration', async () => {
        vi.spyOn(service, 'probeMedia')
          .mockResolvedValueOnce({
            formatName: 'wav',
            durationSeconds: 9.99,
            codecName: 'pcm_s16le',
            sampleRateHz: 16000,
            channels: 1,
            hasAudioStream: true,
            hasVideoStream: false,
          })
          .mockResolvedValueOnce({
            formatName: 'ogg',
            durationSeconds: 9.99,
            codecName: 'opus',
            sampleRateHz: 16000,
            channels: 1,
            hasAudioStream: true,
            hasVideoStream: false,
          });

        vi.spyOn(service, 'normalizeAudio').mockResolvedValueOnce();
        vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(createValidOggOpusBuffer());

        const result = await service.processAndNormalizeAudio(
          createValidWavBuffer(),
          '9.99s.wav',
          'audio/wav',
        );
        expect(result.durationSeconds).toBe(9.99);
      });

      it('accepts audio of exactly 10.000 seconds duration', async () => {
        vi.spyOn(service, 'probeMedia')
          .mockResolvedValueOnce({
            formatName: 'wav',
            durationSeconds: 10.0,
            codecName: 'pcm_s16le',
            sampleRateHz: 16000,
            channels: 1,
            hasAudioStream: true,
            hasVideoStream: false,
          })
          .mockResolvedValueOnce({
            formatName: 'ogg',
            durationSeconds: 10.0,
            codecName: 'opus',
            sampleRateHz: 16000,
            channels: 1,
            hasAudioStream: true,
            hasVideoStream: false,
          });

        vi.spyOn(service, 'normalizeAudio').mockResolvedValueOnce();
        vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(createValidOggOpusBuffer());

        const result = await service.processAndNormalizeAudio(
          createValidWavBuffer(),
          '10.000s.wav',
          'audio/wav',
        );
        expect(result.durationSeconds).toBe(10.0);
      });

      it('rejects audio of 10.001 seconds duration (strict boundary)', async () => {
        vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
          formatName: 'wav',
          durationSeconds: 10.001,
          codecName: 'pcm_s16le',
          sampleRateHz: 16000,
          channels: 1,
          hasAudioStream: true,
          hasVideoStream: false,
        });

        await expect(
          service.processAndNormalizeAudio(createValidWavBuffer(), '10.001s.wav', 'audio/wav'),
        ).rejects.toMatchObject({
          errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
          message: expect.stringContaining('10 seconds'),
        });
      });

      it('rejects audio of 10.010 seconds duration', async () => {
        vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
          formatName: 'wav',
          durationSeconds: 10.01,
          codecName: 'pcm_s16le',
          sampleRateHz: 16000,
          channels: 1,
          hasAudioStream: true,
          hasVideoStream: false,
        });

        await expect(
          service.processAndNormalizeAudio(createValidWavBuffer(), '10.01s.wav', 'audio/wav'),
        ).rejects.toMatchObject({
          errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
          message: expect.stringContaining('10 seconds'),
        });
      });

      it('rejects audio of 10.050 seconds duration (zero tolerance)', async () => {
        vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
          formatName: 'wav',
          durationSeconds: 10.05,
          codecName: 'pcm_s16le',
          sampleRateHz: 16000,
          channels: 1,
          hasAudioStream: true,
          hasVideoStream: false,
        });

        await expect(
          service.processAndNormalizeAudio(createValidWavBuffer(), '10.05s.wav', 'audio/wav'),
        ).rejects.toMatchObject({
          errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
          message: expect.stringContaining('10 seconds'),
        });
      });

      it('rejects audio greater than 10.050 seconds (e.g. 12.5s)', async () => {
        vi.spyOn(service, 'probeMedia').mockResolvedValueOnce({
          formatName: 'wav',
          durationSeconds: 12.5,
          codecName: 'pcm_s16le',
          sampleRateHz: 16000,
          channels: 1,
          hasAudioStream: true,
          hasVideoStream: false,
        });

        await expect(
          service.processAndNormalizeAudio(createValidWavBuffer(), '12.5s.wav', 'audio/wav'),
        ).rejects.toMatchObject({
          errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
          message: expect.stringContaining('10 seconds'),
        });
      });
    });

    describe('Concurrency Limiter Bounded Queue', () => {
      it('rejects incoming request with ERR_TOO_MANY_REQUESTS when queue capacity is exceeded', async () => {
        // Create an instance with maxConcurrent = 1, maxQueueSize = 2
        const configMock: any = {
          get: (key: string) => {
            if (key === 'AUDIO_PROCESSING_MAX_CONCURRENT') return '1';
            return undefined;
          },
        };
        const smallService = new AudioProcessorService(configMock);

        let releaseFirst: () => void = () => {};
        const firstHold = new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });

        // Mock probeMedia to hang on first request for input, and return valid ogg for normalized output
        vi.spyOn(smallService, 'probeMedia').mockImplementation(async (filePath: string) => {
          if (filePath.includes('input-')) {
            await firstHold;
            return {
              formatName: 'wav',
              durationSeconds: 1.0,
              codecName: 'pcm_s16le',
              sampleRateHz: 16000,
              channels: 1,
              hasAudioStream: true,
              hasVideoStream: false,
            };
          }
          return {
            formatName: 'ogg',
            durationSeconds: 1.0,
            codecName: 'opus',
            sampleRateHz: 16000,
            channels: 1,
            hasAudioStream: true,
            hasVideoStream: false,
          };
        });
        vi.spyOn(smallService, 'normalizeAudio').mockResolvedValue();
        vi.spyOn(fs.promises, 'readFile').mockResolvedValue(createValidOggOpusBuffer());

        const wav = createValidWavBuffer();

        // 1st request runs actively (active = 1)
        const p1 = smallService.processAndNormalizeAudio(wav, '1.wav');

        // 2nd and 3rd requests enter queue (queue = 2, maxQueueSize = 1*4 = 4)
        // Let's fire enough requests to exceed maxQueueSize (4)
        const queued: Promise<any>[] = [];
        for (let i = 0; i < 4; i++) {
          queued.push(smallService.processAndNormalizeAudio(wav, `q${i}.wav`));
        }

        // 6th request should exceed queue capacity and immediately reject with TOO_MANY_REQUESTS
        await expect(
          smallService.processAndNormalizeAudio(wav, 'overflow.wav'),
        ).rejects.toMatchObject({
          errorCode: AppErrorCode.TOO_MANY_REQUESTS,
        });

        releaseFirst();
        await Promise.all([p1, ...queued]);
      });
    });
  });

  describe('Supported Formats & Normalization', () => {
    const supportedCases = [
      {
        format: 'WAV',
        ext: 'sample.wav',
        mime: 'audio/wav',
        probeFormat: 'wav',
        codec: 'pcm_s16le',
        buffer: createValidWavBuffer({ durationSeconds: 2 }),
      },
      {
        format: 'MP3',
        ext: 'sample.mp3',
        mime: 'audio/mpeg',
        probeFormat: 'mp3',
        codec: 'mp3',
        buffer: createValidMp3Buffer(),
      },
      {
        format: 'MP4 (audio stream)',
        ext: 'sample.mp4',
        mime: 'audio/mp4',
        probeFormat: 'mov,mp4,m4a,3gp,3g2,mj2',
        codec: 'aac',
        buffer: createValidMp4AudioBuffer(),
      },
      {
        format: 'M4A',
        ext: 'sample.m4a',
        mime: 'audio/m4a',
        probeFormat: 'mov,mp4,m4a,3gp,3g2,mj2',
        codec: 'aac',
        buffer: createValidMp4AudioBuffer({ isM4a: true }),
      },
      {
        format: 'WebM',
        ext: 'sample.webm',
        mime: 'audio/webm',
        probeFormat: 'matroska,webm',
        codec: 'opus',
        buffer: createValidWebmOpusBuffer(),
      },
      {
        format: 'OGG / Ogg Opus',
        ext: 'sample.ogg',
        mime: 'audio/ogg',
        probeFormat: 'ogg',
        codec: 'opus',
        buffer: createValidOggOpusBuffer({ durationSeconds: 3 }),
      },
    ];

    for (const item of supportedCases) {
      it(`probes, accepts, and normalizes valid ${item.format} to 16kHz mono Opus`, async () => {
        vi.spyOn(service, 'probeMedia')
          .mockResolvedValueOnce({
            formatName: item.probeFormat,
            durationSeconds: 3.0,
            codecName: item.codec,
            sampleRateHz: 44100,
            channels: 2, // Stereo source
            hasAudioStream: true,
            hasVideoStream: false,
          })
          .mockResolvedValueOnce({
            formatName: 'ogg',
            durationSeconds: 3.0,
            codecName: 'opus',
            sampleRateHz: 16000,
            channels: 1, // Normalized to mono
            hasAudioStream: true,
            hasVideoStream: false,
          });

        vi.spyOn(service, 'normalizeAudio').mockImplementationOnce(
          async (_in, out) => {
            await fs.promises.writeFile(out, createValidOggOpusBuffer());
          },
        );

        const result = await service.processAndNormalizeAudio(
          item.buffer,
          item.ext,
          item.mime,
        );

        expect(result.format).toBe('ogg/opus');
        expect(result.mimeType).toBe('audio/ogg');
        expect(result.codec).toBe('opus');
        expect(result.sampleRateHz).toBe(16000);
        expect(result.channels).toBe(1);
        expect(result.durationSeconds).toBe(3.0);
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
      });
    }

    it('downmixes multichannel / stereo inputs to mono', async () => {
      vi.spyOn(service, 'probeMedia')
        .mockResolvedValueOnce({
          formatName: 'wav',
          durationSeconds: 2.0,
          codecName: 'pcm_s16le',
          sampleRateHz: 48000,
          channels: 6, // 5.1 surround sound
          hasAudioStream: true,
          hasVideoStream: false,
        })
        .mockResolvedValueOnce({
          formatName: 'ogg',
          durationSeconds: 2.0,
          codecName: 'opus',
          sampleRateHz: 16000,
          channels: 1, // Normalized to mono
          hasAudioStream: true,
          hasVideoStream: false,
        });

      vi.spyOn(service, 'normalizeAudio').mockImplementationOnce(
        async (_in, out) => {
          await fs.promises.writeFile(out, createValidOggOpusBuffer());
        },
      );

      const surroundWav = createValidWavBuffer({ channels: 2 });
      const result = await service.processAndNormalizeAudio(
        surroundWav,
        'surround.wav',
        'audio/wav',
      );

      expect(result.channels).toBe(1);
      expect(result.sampleRateHz).toBe(16000);
    });
  });
});
