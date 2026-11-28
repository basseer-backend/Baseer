import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppErrorCode } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockClient: {
    ping: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    ttl: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      ping: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      ttl: vi.fn(),
      del: vi.fn(),
      eval: vi.fn(),
      quit: vi.fn(),
    };

    service = new RedisService(mockClient as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ping', () => {
    it('returns true when Redis responds with PONG', async () => {
      mockClient.ping.mockResolvedValueOnce('PONG');
      expect(await service.ping()).toBe(true);
    });

    it('returns false when Redis throws an error', async () => {
      mockClient.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect(await service.ping()).toBe(false);
    });
  });

  describe('get', () => {
    it('returns stored value', async () => {
      mockClient.get.mockResolvedValueOnce('{"foo":"bar"}');
      const val = await service.get('key1');
      expect(val).toBe('{"foo":"bar"}');
      expect(mockClient.get).toHaveBeenCalledWith('key1');
    });

    it('translates Redis connection errors into AppException(SERVICE_UNAVAILABLE)', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('Connection is closed'));
      await expect(service.get('key1')).rejects.toThrowError(AppException);
      try {
        await service.get('key1');
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });
  });

  describe('setWithTtl', () => {
    it('calls client.set with EX and ttlSeconds', async () => {
      mockClient.set.mockResolvedValueOnce('OK');
      await service.setWithTtl('key1', 'val1', 7200);
      expect(mockClient.set).toHaveBeenCalledWith('key1', 'val1', 'EX', 7200);
    });

    it('translates errors to SERVICE_UNAVAILABLE', async () => {
      mockClient.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.setWithTtl('k', 'v', 7200)).rejects.toMatchObject({
        errorCode: AppErrorCode.SERVICE_UNAVAILABLE,
      });
    });
  });

  describe('setPreservingTtl', () => {
    it('calls client.set with KEEPTTL', async () => {
      mockClient.set.mockResolvedValueOnce('OK');
      const ok = await service.setPreservingTtl('key1', 'val2');
      expect(ok).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith('key1', 'val2', 'KEEPTTL');
    });
  });

  describe('ttl', () => {
    it('returns TTL in seconds', async () => {
      mockClient.ttl.mockResolvedValueOnce(7190);
      expect(await service.ttl('key1')).toBe(7190);
    });
  });

  describe('del', () => {
    it('deletes key', async () => {
      mockClient.del.mockResolvedValueOnce(1);
      expect(await service.del('key1')).toBe(1);
    });
  });

  describe('evalScript', () => {
    it('executes Lua script with keys and args', async () => {
      mockClient.eval.mockResolvedValueOnce('{"ok":true}');
      const res = await service.evalScript('return ARGV[1]', ['k1'], ['arg1']);
      expect(res).toBe('{"ok":true}');
      expect(mockClient.eval).toHaveBeenCalledWith(
        'return ARGV[1]',
        1,
        'k1',
        'arg1',
      );
    });
  });
});
