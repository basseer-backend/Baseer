const path = require('path');
const Redis = require('ioredis');
const { RedisService } = require(path.resolve(__dirname, '../dist/common/redis/redis.service'));
const { randomUUID } = require('crypto');

async function testNestRedisService() {
  const client = new Redis({
    host: 'localhost',
    port: 6379,
    lazyConnect: true,
  });

  const redisService = new RedisService(client);
  const testKey = `baseer:task:nestjs-smoke-${randomUUID()}`;

  try {
    const isAlive = await redisService.ping();
    console.log('NestJS RedisService ping:', isAlive);

    await redisService.setWithTtl(testKey, JSON.stringify({ test: 'ok' }), 60);
    const val = await redisService.get(testKey);
    const ttl = await redisService.ttl(testKey);
    console.log('NestJS RedisService get:', val);
    console.log('NestJS RedisService ttl:', ttl);

    const deleted = await redisService.del(testKey);
    console.log('NestJS RedisService del:', deleted);

    console.log('NestJS RedisService verification completed successfully.');
  } finally {
    await redisService.onModuleDestroy();
  }
}

testNestRedisService().catch(console.error);
