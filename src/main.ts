import { NestFactory } from '@nestjs/core';
import { ValidationPipe, NotFoundException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { AppException } from './common/exceptions/app.exception.js';
import { AppErrorCode } from './common/constants/error-codes.js';

async function bootstrap() {
//  console.log(config.get<string>('DB_PORT'));
 
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Baseer Server running on: http://localhost:${port}/api/v1`);
  console.log(
    `📚 Swagger API Docs available at: http://localhost:${port}/api-docs`,
  );
}
void bootstrap();
