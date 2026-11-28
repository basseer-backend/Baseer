import { Global, Module, Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('RedisClient');
    const host = configService.get<string>('REDIS_HOST') || 'localhost';
    const port = parseInt(configService.get<string>('REDIS_PORT') || '6379', 10);
    const password = configService.get<string>('REDIS_PASSWORD') || undefined;

    const client = new Redis({
      host,
      port,
      password: password ? password : undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        if (times > 5) {
          logger.warn(`Redis reconnection failed after ${times} attempts.`);
          return null; // Stop retrying automatically
        }
        return Math.min(times * 200, 2000);
      },
    });

    client.on('error', (err) => {
      logger.warn(`Redis connection error [${host}:${port}]: ${err?.message || err}`);
    });

    client.on('connect', () => {
      logger.log(`Connected to Redis at ${host}:${port}`);
    });

    return client;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [redisClientProvider, RedisService],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
