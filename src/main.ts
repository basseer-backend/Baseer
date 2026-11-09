import { NestFactory } from '@nestjs/core';
import { ValidationPipe, NotFoundException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule, ObserveInstrument } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppException } from './common/exceptions/app.exception';
import { AppErrorCode } from './common/constants/error-codes';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Body limit for Base64 image payloads (10MB limit)
  app.use(json({ limit: '10mb' }));

  // Global prefix for all API routes
  app.setGlobalPrefix('api/v1');

  // Single shared instance of HttpExceptionFilter
  const httpExceptionFilter = new HttpExceptionFilter();

  // Global response transformer & exception filter
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(httpExceptionFilter);

  // Global validation pipe with custom exception factory
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((err) =>
          err.constraints ? Object.values(err.constraints) : [],
        );
        return new AppException(
          AppErrorCode.VALIDATION_FAILED,
          undefined,
          messages,
        );
      },
    }),
  );

  // OpenAPI Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Baseer API - بصـير')
    .setDescription(
      'API Contract & Mock Documentation for Baseer assistive mobile application',
    )
    .setVersion('1.0')
    .addTag('System & Health', 'Server health and monitoring')
    .addTag('OCR & Documents', 'Reading documents and short printed text')
    .addTag('Indoor Navigation', 'QR-based pathfinding and routing')
    .addTag('Voice Assistant', 'Speech commands and Arabic intent detection')
    .addTag('Computer Vision', 'Object, Currency, Color, Signs, and Faces')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Write openapi.json to repo root for mobile team & Prism mock server
  try {
    fs.writeFileSync(
      path.join(process.cwd(), 'openapi.json'),
      JSON.stringify(document, null, 2),
      'utf-8',
    );
    console.log('📝 openapi.json written successfully.');
  } catch (err: any) {
    console.warn(
      '⚠️ Could not write openapi.json to root directory:',
      err.message,
    );
  }

  SwaggerModule.setup('api-docs', app, document);

  // Initialize application routes before mounting catch-all fallback
  await app.init();

  // Catch-all 404 middleware for unmapped routes
  app.use((req: any, res: any) => {
    httpExceptionFilter.catch(
      new NotFoundException(`Cannot ${req.method} ${req.url}`),
      {
        switchToHttp: () => ({
          getResponse: () => res,
          getRequest: () => req,
        }),
      } as any,
    );
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Baseer Server running on: http://localhost:${port}/api/v1`);
  console.log(
    `Swagger API Docs available at: http://localhost:${port}/api-docs`,
  );
}

void bootstrap();
