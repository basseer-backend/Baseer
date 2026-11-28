import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppErrorCode } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client && typeof this.client.quit === 'function') {
        await this.client.quit();
      }
    } catch (err: any) {
      this.logger.warn(`Error while disconnecting Redis client: ${err?.message || err}`);
    }
  }

  /**
   * Returns the underlying ioredis client instance.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Health-check ping. Returns true if Redis responds with PONG, false otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get raw string value by key.
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error: any) {
      this.handleRedisError(error, 'get', key);
    }
  }

  /**
   * Set a key with exact TTL in seconds.
   */
  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (error: any) {
      this.handleRedisError(error, 'setWithTtl', key);
    }
  }

  /**
   * Update a key's value while strictly preserving its original expiration timestamp.
   * Uses Redis 6.0+ KEEPTTL option.
   */
  async setPreservingTtl(key: string, value: string): Promise<boolean> {
    try {
      const res = await this.client.set(key, value, 'KEEPTTL');
      return res === 'OK';
    } catch (error: any) {
      this.handleRedisError(error, 'setPreservingTtl', key);
    }
  }

  /**
   * Get remaining TTL in seconds for a key (-2 if not found, -1 if no TTL).
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error: any) {
      this.handleRedisError(error, 'ttl', key);
    }
  }

  /**
   * Delete a key.
   */
  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error: any) {
      this.handleRedisError(error, 'del', key);
    }
  }

  /**
   * Execute an atomic Lua script on Redis.
   */
  async evalScript<T = any>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<T> {
    try {
      const result = await this.client.eval(
        script,
        keys.length,
        ...keys,
        ...args.map(String),
      );
      return result as T;
    } catch (error: any) {
      this.handleRedisError(error, 'evalScript', keys.join(','));
    }
  }

  private handleRedisError(error: any, operation: string, key?: string): never {
    if (error instanceof AppException) {
      throw error;
    }

    const msg = error?.message || String(error);
    this.logger.error(
      `Redis operation "${operation}" failed${key ? ` on key "${key}"` : ''}: ${msg}`,
      error?.stack,
    );

    throw new AppException(
      AppErrorCode.SERVICE_UNAVAILABLE,
      'Task state service temporarily unavailable. Please try again later.',
    );
  }
}
